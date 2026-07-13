-- Defensa en profundidad: los mismos límites ya validados en el server
-- (lib/security/text-limits.ts) también quedan forzados en la BD, por si
-- algún camino de escritura futuro (RPC, script, Studio) los saltara.

alter table public.organizations
  add constraint organizations_name_length check (char_length(name) <= 200),
  add constraint organizations_nit_length check (char_length(nit) <= 30);

alter table public.suppliers
  add constraint suppliers_legal_name_length check (char_length(legal_name) <= 200),
  add constraint suppliers_nit_length check (char_length(nit) <= 30),
  add constraint suppliers_category_length check (category is null or char_length(category) <= 100),
  add constraint suppliers_primary_contact_email_length
    check (primary_contact_email is null or char_length(primary_contact_email) <= 254);

alter table public.document_types
  add constraint document_types_name_length check (char_length(name) <= 150),
  add constraint document_types_description_length
    check (description is null or char_length(description) <= 1000);

alter table public.invitations
  add constraint invitations_email_length check (char_length(email) <= 254);

alter table public.documents
  add constraint documents_review_notes_length
    check (review_notes is null or char_length(review_notes) <= 2000);
