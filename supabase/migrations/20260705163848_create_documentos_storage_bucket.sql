-- Bucket privado "documentos" + políticas RLS en storage.objects.
--
-- Convención de ruta (la fija el server, nunca el cliente):
--   {organization_id}/{supplier_id}/{document_id}/{uuid}.{ext}
--
-- storage.foldername(name) devuelve los segmentos de carpeta como text[]:
--   (storage.foldername(name))[1] = organization_id
--   (storage.foldername(name))[2] = supplier_id
--   (storage.foldername(name))[3] = document_id
--
-- NOTA sobre grants: a diferencia de las tablas de public.*, la extensión de
-- Storage de Supabase ya deja storage.objects/storage.buckets con GRANT
-- completo para authenticated/anon/service_role de fábrica (verificado
-- contra el local) y RLS ya viene activada. Aquí solo hace falta el bucket
-- y las policies — ningún GRANT adicional.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false, -- privado: cero URLs públicas, solo signed URLs de corta duración
  15728640, -- 15 MB — mismo límite que exigirá la Server Action de subida (Fase 5.2); defensa en profundidad a nivel de bucket
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: castea un segmento de carpeta a uuid sin reventar la policy si el
-- path viene malformado (p.ej. alguien pegando una ruta a mano). Sin esto,
-- 'texto-cualquiera'::uuid lanza una excepción de Postgres en vez de negar
-- limpiamente — y CLAUDE.md prohíbe que un error de servidor se filtre tal
-- cual al cliente.
-- ---------------------------------------------------------------------------

create or replace function public.try_cast_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke execute on function public.try_cast_uuid(text) from public;
grant execute on function public.try_cast_uuid(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SELECT (ver/descargar): miembros de la org dueña de la carpeta [1], o el
-- proveedor dueño de la carpeta [2].
-- ---------------------------------------------------------------------------

create policy "documentos_select_org_members"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_member_of(public.try_cast_uuid((storage.foldername(name))[1]))
  );

create policy "documentos_select_supplier"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_supplier_user_of(public.try_cast_uuid((storage.foldername(name))[2]))
  );

-- ---------------------------------------------------------------------------
-- INSERT (subir): además de pertenecer a la carpeta correspondiente, se
-- valida que [1] (organization_id) y [2] (supplier_id) del PATH sean
-- consistentes entre sí según la tabla suppliers — evita que alguien suba
-- bajo una organization_id ajena mientras usa un supplier_id legítimo (o
-- viceversa), lo que "colaría" el archivo en el listado de otro tenant.
-- ---------------------------------------------------------------------------

create policy "documentos_insert_org_members"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documentos'
    and public.is_member_of(public.try_cast_uuid((storage.foldername(name))[1]))
    and exists (
      select 1
      from public.suppliers s
      where s.id = public.try_cast_uuid((storage.foldername(name))[2])
        and s.organization_id = public.try_cast_uuid((storage.foldername(name))[1])
    )
  );

create policy "documentos_insert_supplier"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documentos'
    and public.is_supplier_user_of(public.try_cast_uuid((storage.foldername(name))[2]))
    and public.try_cast_uuid((storage.foldername(name))[1]) = (
      select organization_id
      from public.suppliers
      where id = public.try_cast_uuid((storage.foldername(name))[2])
    )
  );

-- ---------------------------------------------------------------------------
-- UPDATE (upsert al mismo path / mover objeto): mismas reglas que INSERT.
-- ---------------------------------------------------------------------------

create policy "documentos_update_org_members"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_member_of(public.try_cast_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'documentos'
    and public.is_member_of(public.try_cast_uuid((storage.foldername(name))[1]))
    and exists (
      select 1
      from public.suppliers s
      where s.id = public.try_cast_uuid((storage.foldername(name))[2])
        and s.organization_id = public.try_cast_uuid((storage.foldername(name))[1])
    )
  );

create policy "documentos_update_supplier"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_supplier_user_of(public.try_cast_uuid((storage.foldername(name))[2]))
  )
  with check (
    bucket_id = 'documentos'
    and public.is_supplier_user_of(public.try_cast_uuid((storage.foldername(name))[2]))
    and public.try_cast_uuid((storage.foldername(name))[1]) = (
      select organization_id
      from public.suppliers
      where id = public.try_cast_uuid((storage.foldername(name))[2])
    )
  );

-- ---------------------------------------------------------------------------
-- DELETE: solo owner/admin de la organización. Los proveedores NUNCA borran
-- — el rastro de auditoría de lo que subieron se conserva (igual que
-- documents/document_versions no tienen policy de DELETE para nadie del
-- lado del proveedor).
-- ---------------------------------------------------------------------------

create policy "documentos_delete_admins"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documentos'
    and public.is_admin_of(public.try_cast_uuid((storage.foldername(name))[1]))
  );
