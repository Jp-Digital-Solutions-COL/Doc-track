-- Fase 10.1 — gating de funcionalidades por plan. Dos planes: "estandar"
-- (Opción 1: estados y alertas fijas) y "avanzado" (Opción 2: alertas
-- configurables; estados personalizables y validación por OCR quedan
-- declarados como features futuras en lib/plans/features.ts, sin
-- implementación todavía). Reemplaza los valores viejos (free/pro/enterprise),
-- que nunca se usaron desde el código de la app.
update public.organizations set plan = 'estandar' where plan not in ('estandar', 'avanzado');

alter table public.organizations
  drop constraint organizations_plan_check;

alter table public.organizations
  alter column plan set default 'estandar',
  add constraint organizations_plan_check check (plan in ('estandar', 'avanzado'));

-- Umbrales de alerta personalizados (días antes del vencimiento). Solo tiene
-- efecto si organizations.plan = 'avanzado' — el gating vive en la lógica de
-- la app (app/api/cron/alerts + lib/documents/expiry-alerts.ts), no aquí: un
-- valor guardado en una org "estandar" (p.ej. si se degrada el plan) se
-- ignora y se usa el default fijo [30,15,5].
alter table public.organizations
  add column alert_threshold_days integer[];
