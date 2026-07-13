-- Añade acceso de SOLO LECTURA para contactos de proveedor (supplier_users)
-- sobre su propio checklist y el estado de sus documentos. Es una migración
-- nueva (no se edita una ya aplicada) que agrega políticas ADICIONALES —
-- conviven con las de is_member_of() ya existentes (permisos OR-eados).
--
-- A PROPÓSITO no se agrega aquí INSERT/UPDATE de `documents` para
-- proveedores: la subida real de archivos es la Fase 5 del plan y necesita
-- diseño propio para evitar que un proveedor se auto-apruebe (p.ej. escribir
-- status='aprobado' o reviewed_by directamente). Dar solo SELECT ahora es la
-- superficie mínima segura para el portal de esta fase.

create policy "supplier_requirements_select_supplier"
  on public.supplier_requirements
  for select
  to authenticated
  using (public.is_supplier_user_of(supplier_id));

create policy "documents_select_supplier"
  on public.documents
  for select
  to authenticated
  using (public.is_supplier_user_of(supplier_id));

create policy "document_versions_select_supplier"
  on public.document_versions
  for select
  to authenticated
  using (public.is_supplier_user_of((select d.supplier_id from public.documents d where d.id = document_id)));
