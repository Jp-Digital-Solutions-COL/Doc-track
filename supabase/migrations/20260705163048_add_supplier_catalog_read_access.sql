-- Falta real detectada probando el portal del proveedor en el navegador:
-- las policies de suppliers/document_types solo cubrían is_member_of(), así
-- que cuando /portal hace un embed de PostgREST (supplier_users -> suppliers,
-- supplier_requirements -> document_types), RLS bloqueaba la tabla del lado
-- del join para un supplier_user — el embed volvía null en silencio en vez
-- de fallar, y la página mostraba "tu empresa"/"Documento" (los fallbacks).

create policy "suppliers_select_supplier_self"
  on public.suppliers
  for select
  to authenticated
  using (public.is_supplier_user_of(id));

-- Un proveedor solo ve los document_types que de verdad le aplican (los que
-- están en su propio supplier_requirements) — no el catálogo completo de la
-- organización, que no le concierne.
create policy "document_types_select_supplier"
  on public.document_types
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.supplier_requirements sr
      where sr.document_type_id = document_types.id
        and public.is_supplier_user_of(sr.supplier_id)
    )
  );
