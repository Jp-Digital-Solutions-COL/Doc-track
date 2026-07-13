// Cloudflare pone la IP real del cliente en cf-connecting-ip — a diferencia
// de x-forwarded-for, la setea el borde de Cloudflare directamente y no se
// puede spoofear encadenando proxies. x-forwarded-for queda de fallback por
// si en algún punto se sirve detrás de otro proxy. En local dev todo esto
// normalmente viene vacío — se agrupa bajo "local" (un solo bucket,
// suficiente para desarrollo de un solo desarrollador).
export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "local";
}
