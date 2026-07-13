import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash usa REST (fetch), no una conexión TCP — es lo único que funciona
// dentro de Next.js Middleware y de Cloudflare Workers (runtime de edge, sin
// sockets crudos). Por eso es la opción recomendada para rate limiting acá,
// no una elección arbitraria.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// No fail-closed a propósito (una Upstash mal configurada no debe tumbar
// login/subida/descarga para todo el mundo) — pero el modo degradado no
// puede quedar en silencio. Esto corre una vez por arranque en frío de cada
// worker, así que en Cloudflare aparece en los logs cada vez que una
// instancia nueva carga el módulo sin las variables de Upstash puestas.
if (!redis && process.env.NODE_ENV === "production") {
  console.error(
    "\n" +
      "🚨🚨🚨 RATE LIMITING DEGRADADO EN PRODUCCIÓN 🚨🚨🚨\n" +
      "Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. El rate " +
      "limiting cayó al fallback en memoria de UN SOLO PROCESO, que NO " +
      "limita nada de verdad en un entorno con múltiples instancias " +
      "(login/subida/descarga/formulario público quedan efectivamente sin " +
      "protección). Configura las variables de Upstash como secrets de " +
      "Cloudflare — ver .env.local.example.\n"
  );
}

export type LimiterName = "login" | "upload" | "download" | "public_form";

const CONFIGS: Record<LimiterName, { limit: number; windowSeconds: number }> = {
  login: { limit: 10, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 60 },
  download: { limit: 60, windowSeconds: 60 },
  // Formularios públicos sin auth (solicitud de derechos del titular): más
  // estricto que login, evita spam/enumeración de NITs.
  public_form: { limit: 5, windowSeconds: 60 },
};

const limiters: Partial<Record<LimiterName, Ratelimit>> = {};

function getLimiter(name: LimiterName): Ratelimit | null {
  if (!redis) return null;
  const existing = limiters[name];
  if (existing) return existing;
  const { limit, windowSeconds } = CONFIGS[name];
  const created = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: `ratelimit:${name}`,
  });
  limiters[name] = created;
  return created;
}

// ponytail: sin UPSTASH_REDIS_REST_URL/TOKEN (dev local), cae a un contador
// en memoria de UN SOLO proceso — sirve para probar la lógica localmente,
// pero NO limita nada de verdad en producción con múltiples instancias
// (cada invocación puede ser un worker distinto sin memoria compartida). En
// Cloudflare, configurar las variables de Upstash es obligatorio, no opcional.
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function checkMemoryLimit(name: LimiterName, identifier: string): boolean {
  const { limit, windowSeconds } = CONFIGS[name];
  const key = `${name}:${identifier}`;
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}

export async function checkRateLimit(name: LimiterName, identifier: string): Promise<{ success: boolean }> {
  const limiter = getLimiter(name);
  if (limiter) {
    const { success } = await limiter.limit(identifier);
    return { success };
  }
  return { success: checkMemoryLimit(name, identifier) };
}
