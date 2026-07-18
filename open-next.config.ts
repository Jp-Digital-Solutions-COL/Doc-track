import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// ponytail: sin override de incrementalCache (cae al default en memoria) —
// esta app no usa ISR/revalidación estática, todo es Server Components con
// datos frescos de Supabase. Agregar el override de R2 si en algún momento
// se agrega una página con `revalidate` o `generateStaticParams`.
export default defineCloudflareConfig();
