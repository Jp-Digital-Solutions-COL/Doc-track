-- Marca de "borrado seguro" de datos personales de un proveedor (supresión,
-- Ley 1581). No es un soft-delete de la fila completa: la razón social/NIT
-- son datos del negocio, no datos personales, y se conservan por relación
-- contractual. Lo que se anonimiza al ejecutar el borrado (ver
-- lib/actions/supplier-erasure.ts) son primary_contact_email,
-- legal_rep_full_name/id_number_enc y beneficial_owner_full_name/id_number_enc.
alter table public.suppliers
  add column personal_data_erased_at timestamptz;
