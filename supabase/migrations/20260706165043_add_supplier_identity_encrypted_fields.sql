-- Cédula del representante legal y del beneficiario final (>5%): dato
-- personal de alta sensibilidad (ver CLAUDE.md / PLAN Fase 8.2). El número se
-- guarda SIEMPRE cifrado por la app (lib/security/field-encryption.ts, AES-256-GCM,
-- clave fuera de la BD) — estas columnas nunca contienen el número en claro.
-- No se agregan policies nuevas: son columnas de más en `suppliers`, ya
-- cubierta por las policies existentes de esa tabla. El límite real de
-- exposición lo pone el código de la app, que nunca debe incluir estas
-- columnas en un select("*") de listados — solo en el flujo dedicado de
-- lectura/descifrado que audita cada acceso.
alter table public.suppliers
  add column legal_rep_full_name text,
  add column legal_rep_id_number_enc text,
  add column beneficial_owner_full_name text,
  add column beneficial_owner_id_number_enc text;

comment on column public.suppliers.legal_rep_id_number_enc is
  'Cédula del representante legal, cifrada en la app (nunca en claro). Ver lib/security/field-encryption.ts';
comment on column public.suppliers.beneficial_owner_id_number_enc is
  'Cédula del beneficiario final, cifrada en la app (nunca en claro). Ver lib/security/field-encryption.ts';

alter table public.suppliers
  add constraint suppliers_legal_rep_full_name_length
    check (legal_rep_full_name is null or char_length(legal_rep_full_name) <= 200),
  add constraint suppliers_legal_rep_id_number_enc_length
    check (legal_rep_id_number_enc is null or char_length(legal_rep_id_number_enc) <= 500),
  add constraint suppliers_beneficial_owner_full_name_length
    check (beneficial_owner_full_name is null or char_length(beneficial_owner_full_name) <= 200),
  add constraint suppliers_beneficial_owner_id_number_enc_length
    check (beneficial_owner_id_number_enc is null or char_length(beneficial_owner_id_number_enc) <= 500);
