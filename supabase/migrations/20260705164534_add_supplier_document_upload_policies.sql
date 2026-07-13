-- Fase 5.2: habilita la SUBIDA real de documentos.
--
-- Hasta ahora los proveedores solo tenían SELECT en documents/document_versions
-- (a propósito — ver comentario en 20260705161036_add_supplier_access_policies)
-- porque dar INSERT sin pensarlo permitía que un proveedor insertara su
-- propia fila con status='aprobado' o reviewed_by ya relleno, auto-aprobándose.
--
-- La solución: el INSERT (de cualquiera, proveedor U org member) solo se
-- permite si la fila nace en el estado neutro — status='cargado' y sin
-- reviewed_by/review_notes. Cambiar el estado es trabajo de la Fase 6 (flujo
-- de revisión), vía UPDATE, no del INSERT de la subida.

-- Se reemplaza la policy de INSERT de org members para agregarle esa misma
-- restricción (antes no la tenía).
drop policy if exists "documents_insert_members" on public.documents;

create policy "documents_insert_members"
  on public.documents
  for insert
  to authenticated
  with check (
    public.is_member_of(organization_id)
    and status = 'cargado'
    and reviewed_by is null
    and review_notes is null
  );

create policy "documents_insert_supplier"
  on public.documents
  for insert
  to authenticated
  with check (
    public.is_supplier_user_of(supplier_id)
    and organization_id = (select s.organization_id from public.suppliers s where s.id = supplier_id)
    and status = 'cargado'
    and reviewed_by is null
    and review_notes is null
  );

create policy "document_versions_insert_supplier"
  on public.document_versions
  for insert
  to authenticated
  with check (
    public.is_supplier_user_of((select d.supplier_id from public.documents d where d.id = document_id))
  );
