-- Algunos documentos no vencen N días después de expedidos, sino en una
-- fecha fija de cada año (ej. pólizas que renuevan cada 1 de enero, o cada
-- 30 de abril). Se agrega un modo de vigencia alterno por mes/día, mutuamente
-- excluyente con default_validity_days (uno u otro, nunca ambos).

alter table public.document_types
  add column default_validity_month smallint check (default_validity_month between 1 and 12),
  add column default_validity_day smallint check (default_validity_day between 1 and 31);

alter table public.document_types
  add constraint document_types_validity_month_day_together
    check ((default_validity_month is null) = (default_validity_day is null));

alter table public.document_types
  add constraint document_types_validity_mode_exclusive
    check (default_validity_days is null or default_validity_month is null);
