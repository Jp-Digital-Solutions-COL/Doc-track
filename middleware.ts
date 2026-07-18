import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { MFA_REQUIRED_ROLES } from "@/lib/auth/mfa";
import { getCurrentMembership, hasSupplierAccess } from "@/lib/auth/session";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/client-ip";

const SUPERADMIN_PREFIX = "/superadmin";
const PROTECTED_PREFIX = "/app";
const PORTAL_PREFIX = "/portal";
const PORTAL_LOGIN_ROUTE = "/portal/login";
const AUTH_ROUTES = ["/login", "/signup"];
const MFA_ENROLL_ROUTE = "/mfa/enroll";
const MFA_VERIFY_ROUTE = "/mfa/verify";
const DOCUMENTS_API_PREFIX = "/api/documents";
// Rutas cuyo POST se limita por IP contra fuerza bruta de login — distinto
// de AUTH_ROUTES (esa lista maneja la redirección "ya autenticado", no el
// rate limit, y /portal/login necesita quedarse fuera de AUTH_ROUTES o
// rompe la redirección específica de proveedores más abajo).
const LOGIN_RATE_LIMITED_ROUTES = ["/login", "/signup", "/portal/login"];

// CSP estricta basada en nonce (recomendada por Next.js para App Router) +
// refresco de sesión de Supabase + protección de /app/* (organization_members,
// MFA para owner/admin) y /portal/* (supplier_users, sin MFA). Todo en un
// solo middleware porque Next.js solo permite uno por proyecto.
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rate limit por IP — antes de cualquier trabajo con Supabase, para
  // rechazar barato. El límite por usuario/correo va además dentro de cada
  // Server Action / Route Handler, que sí conoce quién es.
  if (request.method === "POST" && LOGIN_RATE_LIMITED_ROUTES.includes(pathname)) {
    const { success } = await checkRateLimit("login", getClientIp(request.headers));
    if (!success) {
      return new NextResponse("Demasiados intentos. Intenta de nuevo en un minuto.", { status: 429 });
    }
  }
  if (pathname.startsWith(DOCUMENTS_API_PREFIX)) {
    const { success } = await checkRateLimit("download", getClientIp(request.headers));
    if (!success) {
      return new NextResponse("Demasiadas solicitudes. Intenta de nuevo en un minuto.", { status: 429 });
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""};
    font-src 'self';
    connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `;
  const contentSecurityPolicyHeaderValue = cspHeader
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  // `response` se reasigna cada vez que Supabase necesita reescribir las
  // cookies de sesión (p.ej. al refrescar el access token).
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: getUser(), nunca getSession(), en código de server — getUser()
  // valida el JWT contra el servidor de Auth; getSession() solo lo decodifica
  // y puede confiar en un token ya revocado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute = pathname.startsWith(PROTECTED_PREFIX);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isMfaRoute = pathname === MFA_ENROLL_ROUTE || pathname === MFA_VERIFY_ROUTE;
  const isPortalLoginRoute = pathname === PORTAL_LOGIN_ROUTE;
  const isPortalRoute = pathname.startsWith(PORTAL_PREFIX) && !isPortalLoginRoute;
  const isSuperadminRoute = pathname.startsWith(SUPERADMIN_PREFIX);

  if (!user && (isProtectedRoute || isMfaRoute || isSuperadminRoute)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Superadmin es un rol de plataforma aparte de organization_members — no
  // exige MFA (a diferencia de owner/admin) porque hoy solo lo usa quien
  // opera la plataforma directamente, no un cliente. Revalidar el rol acá es
  // solo UX (redirect limpio); la barrera real está en cada Server Action
  // (createOrganizationAndInviteAdmin usa el cliente admin, que bypassa RLS).
  if (user && isSuperadminRoute && !(await isSuperadmin(supabase))) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  if (!user && isPortalRoute) {
    const portalLoginUrl = new URL(PORTAL_LOGIN_ROUTE, request.url);
    portalLoginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(portalLoginUrl);
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  if (user && (isProtectedRoute || isMfaRoute)) {
    const membership = await getCurrentMembership(supabase, user.id);

    if (!membership) {
      // No es organization_member — si es proveedor, /app y /mfa/* no son
      // para él.
      if (await hasSupplierAccess(supabase, user.id)) {
        return NextResponse.redirect(new URL("/portal", request.url));
      }
      // Ni org member ni proveedor: no hay MFA que exigir. Se deja pasar —
      // la propia página de /app resuelve el caso "sin rol".
    } else {
      // getAuthenticatorAssuranceLevel() lee el JWT ya cargado por getUser(),
      // no hace una llamada de red adicional.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const hasVerifiedFactor = aal?.nextLevel === "aal2";
      const stepUpNeeded = hasVerifiedFactor && aal?.currentLevel !== "aal2";

      if (stepUpNeeded && pathname !== MFA_VERIFY_ROUTE) {
        const verifyUrl = new URL(MFA_VERIFY_ROUTE, request.url);
        verifyUrl.searchParams.set("redirectTo", pathname === MFA_ENROLL_ROUTE ? "/app" : pathname);
        return NextResponse.redirect(verifyUrl);
      }

      if (!stepUpNeeded && pathname === MFA_VERIFY_ROUTE) {
        // Ya está en aal2, o no tiene factor que retar: no hay nada que
        // hacer en /mfa/verify. Rebota a /app — si en realidad necesitaba
        // enrolar, el siguiente paso de este mismo middleware lo mandará a
        // /mfa/enroll.
        return NextResponse.redirect(new URL("/app", request.url));
      }

      if (
        isProtectedRoute &&
        !hasVerifiedFactor &&
        MFA_REQUIRED_ROLES.includes(membership.role as (typeof MFA_REQUIRED_ROLES)[number])
      ) {
        const enrollUrl = new URL(MFA_ENROLL_ROUTE, request.url);
        enrollUrl.searchParams.set("redirectTo", pathname);
        return NextResponse.redirect(enrollUrl);
      }

      if (pathname === MFA_ENROLL_ROUTE && hasVerifiedFactor) {
        // Ya tiene un factor verificado: lo que falta es el reto, no un
        // segundo enrolamiento.
        return NextResponse.redirect(new URL(MFA_VERIFY_ROUTE, request.url));
      }
    }
  }

  if (user && (isPortalRoute || isPortalLoginRoute)) {
    const supplierOk = await hasSupplierAccess(supabase, user.id);

    if (isPortalLoginRoute && supplierOk) {
      return NextResponse.redirect(new URL("/portal", request.url));
    }
    if (isPortalRoute && !supplierOk) {
      const membership = await getCurrentMembership(supabase, user.id);
      return NextResponse.redirect(new URL(membership ? "/app" : PORTAL_LOGIN_ROUTE, request.url));
    }
  }

  response.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);
  return response;
}

export const config = {
  // /api/cron queda afuera a propósito: se autentica con CRON_SECRET, no con
  // sesión de Supabase, y lo llama el Cron Trigger de Cloudflare (no un navegador) — no
  // necesita ninguna de las cosas que hace este middleware. /api/documents
  // SÍ pasa por aquí: es donde aplica el rate limit de descargas.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
