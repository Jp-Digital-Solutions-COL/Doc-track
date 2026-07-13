-- Falta necesaria para la Fase 5.4: cuando un proveedor resube un documento
-- del mismo tipo, la Server Action hace UPDATE sobre la fila existente de
-- documents (apunta a la nueva versión) — hasta ahora los proveedores no
-- tenían NINGUNA policy de UPDATE en documents.
--
-- Mismo candado que en documents_insert_supplier: la resubida SIEMPRE debe
-- dejar la fila en estado neutro (status='cargado', sin reviewed_by/notes) —
-- si no, un proveedor podría reescribir su propio documento ya aprobado con
-- WITH CHECK laxo y quedarse con el status viejo, o peor, mandarlo él mismo.

create policy "documents_update_supplier"
  on public.documents
  for update
  to authenticated
  using (public.is_supplier_user_of(supplier_id))
  with check (
    public.is_supplier_user_of(supplier_id)
    and organization_id = (select s.organization_id from public.suppliers s where s.id = supplier_id)
    and status = 'cargado'
    and reviewed_by is null
    and review_notes is null
  );
