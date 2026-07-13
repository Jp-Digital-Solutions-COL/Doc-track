-- Idempotencia del cron de alertas (Fase 7.1): antes de mandar un correo,
-- el job intenta insertar la fila con esta clave; si ya existe (mismo tipo +
-- destinatario + entidad + día), el insert falla por la unique constraint y
-- el job sabe que ya se envió hoy sin necesidad de un SELECT previo aparte
-- (evita una condición de carrera entre "reviso si existe" e "inserto").
--
-- Formato: `${type}:${recipient}:${supplierId}:${documentTypeId ?? ''}:${YYYY-MM-DD}`
-- Una sola columna de texto en vez de un índice de expresión compuesto sobre
-- payload (jsonb) — misma garantía, mucho más simple de leer y depurar.

alter table public.notifications
  add column dedupe_key text not null unique;
