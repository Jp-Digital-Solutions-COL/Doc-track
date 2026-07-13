-- El flujo de borrado seguro (supresión, Ley 1581 —
-- lib/actions/supplier-erasure.ts) borra documents fuera del plazo de
-- retención y revoca accesos de supplier_users, corriendo con el cliente
-- normal (RLS), no con service_role — es una acción de owner/admin que debe
-- seguir revalidando organization_id como cualquier otra. Ninguna de las dos
-- tablas tenía policy (ni GRANT) de DELETE para `authenticated` porque nunca
-- hizo falta hasta ahora.
grant delete on public.documents to authenticated;
grant delete on public.supplier_users to authenticated;

create policy "documents_delete_admins"
  on public.documents
  for delete
  to authenticated
  using (public.is_admin_of(organization_id));

create policy "supplier_users_delete_admins"
  on public.supplier_users
  for delete
  to authenticated
  using (public.is_admin_of(organization_id));
