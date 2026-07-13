-- Hallazgo del checklist de seguridad pre-lanzamiento: document_versions y
-- los objetos de Storage tenían policies de UPDATE sin ningún consumidor real
-- (grep confirma que el código solo hace insert / .upload() / .remove(),
-- nunca .update() sobre estas rutas) — dejaban reescribir en el sitio una
-- versión ya subida, socavando la propia razón de ser de document_versions
-- (poder probar qué se subió y cuándo). Se tratan como append-only, igual que
-- audit_logs: se quita la policy Y se revoca el privilegio a nivel de GRANT
-- (defensa en profundidad — así ni una policy futura mal escrita podría
-- reabrir esto).
drop policy "document_versions_update_members" on public.document_versions;
revoke update on public.document_versions from authenticated, anon, service_role;

-- storage.objects es una tabla de Supabase (dueña: supabase_storage_admin),
-- no algo que creamos nosotros — y ninguna operación de la app
-- (upload/remove/signed url) necesita UPDATE. Se quitan las dos policies:
-- con RLS activo y CERO policies de UPDATE para authenticated/anon, esos
-- roles quedan bloqueados por defecto (verificado con una fila real: 0 filas
-- afectadas, no solo "no hay filas que coincidan").
--
-- OJO: a diferencia de document_versions, aquí NO se agrega el
-- `revoke update ... from ...` — se intentó y falla en silencio (sin error,
-- pero sin efecto): el rol `postgres` que corre las migraciones no es dueño
-- de storage.objects ni superusuario, y el GRANT de UPDATE a
-- authenticated/anon/service_role fue otorgado por supabase_storage_admin,
-- no por postgres — revocar el grant de OTRO grantor requiere ser el dueño
-- de la tabla o superusuario, ninguno de los dos aplica aquí. Esto es una
-- limitación de la plataforma (igual en Supabase Pro hosted), no algo que
-- esta migración pueda resolver. La mitigación real para `service_role` en
-- esta tabla puntual sigue siendo la regla de siempre (CLAUDE.md #3): la key
-- nunca se usa fuera del server, y el código de la app jamás llama
-- `.storage...update()` (confirmado por grep).
drop policy "documentos_update_org_members" on storage.objects;
drop policy "documentos_update_supplier" on storage.objects;
