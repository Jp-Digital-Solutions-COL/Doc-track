-- used_at significaba dos cosas a la vez: "el invitado la aceptó" (seteado en
-- acceptOrgAdminInvitation) y "quedó invalidada porque se reenvió el correo"
-- (seteado en resendOrgAdminInvitation) — el panel de superadmin mostraba
-- "aceptada" en ambos casos. revoked_at separa el segundo caso.
alter table public.org_provision_invitations
  add column if not exists revoked_at timestamptz;
