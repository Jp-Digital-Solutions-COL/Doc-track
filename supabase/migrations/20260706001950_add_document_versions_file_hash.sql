-- Cada versión necesita su PROPIO hash — la versioning (Fase 5.4) exige
-- poder verificar la integridad de cualquier versión histórica, no solo la
-- vigente (que ya tenía su hash en documents.file_hash). La tabla siempre
-- está vacía en este punto (el proyecto solo corre vía `supabase db reset`,
-- nunca con datos reales previos), así que no hace falta backfill/default.

alter table public.document_versions
  add column file_hash text not null;

alter table public.document_versions
  add constraint document_versions_file_hash_check check (file_hash ~ '^[0-9a-f]{64}$');
