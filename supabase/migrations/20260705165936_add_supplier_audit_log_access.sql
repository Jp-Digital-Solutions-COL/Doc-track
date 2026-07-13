-- Falta real detectada probando la subida desde el portal del proveedor: la
-- única policy de INSERT en audit_logs exigía is_member_of(organization_id),
-- así que cuando un contacto de proveedor subía un documento, el insert del
-- log fallaba en silencio (logAudit() no revisa el error) — la subida
-- funcionaba pero quedaba SIN RASTRO DE AUDITORÍA, justo lo que CLAUDE.md
-- prohíbe ("todo acceso/descarga/aprobación se registra en audit_logs").
--
-- audit_logs no tiene columna supplier_id (su unidad de aislamiento es
-- organization_id), así que la policy no puede exigir is_supplier_user_of()
-- sobre un proveedor puntual — se permite si el usuario es contacto ACTIVO
-- de CUALQUIER proveedor de esa organización.

create policy "audit_logs_insert_supplier"
  on public.audit_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.supplier_users su
      where su.user_id = auth.uid()
        and su.organization_id = audit_logs.organization_id
        and su.status = 'active'
    )
  );
