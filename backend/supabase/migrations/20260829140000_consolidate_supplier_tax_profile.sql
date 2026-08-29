-- Consolida la ficha tributaria de proveedores sin mezclarla con desempeño,
-- cuentas bancarias ni operaciones de compra.

alter table public.suppliers
  add column taxpayer_status text,
  add column domicile_condition text,
  add column ubigeo_code text,
  add column tax_data_source text,
  add column tax_checked_at timestamptz,
  add constraint suppliers_taxpayer_status_length
    check (taxpayer_status is null or char_length(taxpayer_status) between 2 and 40),
  add constraint suppliers_domicile_condition_length
    check (domicile_condition is null or char_length(domicile_condition) between 2 and 40),
  add constraint suppliers_ubigeo_code_format
    check (ubigeo_code is null or ubigeo_code ~ '^[0-9]{6}$'),
  add constraint suppliers_tax_data_source_length
    check (tax_data_source is null or char_length(tax_data_source) between 2 and 40),
  add constraint suppliers_tax_provenance_consistency
    check (
      (tax_data_source is null and tax_checked_at is null)
      or (tax_data_source is not null and tax_checked_at is not null)
    );

update public.suppliers
set
  taxpayer_status = case when sunat_status = 'baja' then 'BAJA' else null end,
  domicile_condition = case
    when sunat_status = 'habido' then 'HABIDO'
    when sunat_status = 'no-habido' then 'NO HABIDO'
    else null
  end
where sunat_status <> 'no-verificado';

comment on column public.suppliers.taxpayer_status is
  'Estado del contribuyente obtenido de la fuente tributaria o ingresado manualmente.';
comment on column public.suppliers.domicile_condition is
  'Condición del domicilio fiscal reportada por la fuente tributaria.';
comment on column public.suppliers.tax_data_source is
  'Proveedor que confirmó los datos tributarios; requiere tax_checked_at.';

grant select (
  taxpayer_status,
  domicile_condition,
  ubigeo_code,
  tax_data_source,
  tax_checked_at
) on table public.suppliers to authenticated;
