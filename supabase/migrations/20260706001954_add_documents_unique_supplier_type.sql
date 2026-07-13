-- A partir de la Fase 5.4, "resubir un documento del mismo tipo" crea una
-- versión nueva en document_versions en vez de una fila nueva en documents.
-- Esta constraint hace explícito y a nivel de BD el invariante: a lo sumo
-- UN documents por (supplier_id, document_type_id) — el historial completo
-- vive en document_versions, no en filas duplicadas de documents.

alter table public.documents
  add constraint documents_supplier_id_document_type_id_key unique (supplier_id, document_type_id);
