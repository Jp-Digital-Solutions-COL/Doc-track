-- lib/actions/superadmin.ts crea/reenvía invitaciones de admin a una
-- organización usando el cliente autenticado normal (no el admin client) —
-- por eso necesita policies reales, no solo el SELECT que ya tenía. El flujo
-- de aceptación (acceptOrgAdminInvitation) sigue usando el cliente admin,
-- porque quien acepta no tiene sesión todavía; esto es aparte, para cuando
-- el ACTOR ya es un superadmin autenticado.
grant insert, update on public.org_provision_invitations to authenticated;

create policy "org_provision_invitations_insert_superadmin"
  on public.org_provision_invitations
  for insert
  to authenticated
  with check (public.is_superadmin());

create policy "org_provision_invitations_update_superadmin"
  on public.org_provision_invitations
  for update
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
