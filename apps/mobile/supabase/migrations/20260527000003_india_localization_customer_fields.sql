-- India localization: customer identity + postal fields
alter table public.customers add column if not exists postal_code text;
alter table public.customers add column if not exists id_type text;
alter table public.customers add column if not exists id_value text;
alter table public.customers add column if not exists notes text;

-- Backfill from legacy BR fields when present
update public.customers
set postal_code = coalesce(nullif(postal_code, ''), nullif(cep, ''))
where coalesce(nullif(postal_code, ''), '') = '';

update public.customers
set id_type = case
  when coalesce(id_type, '') <> '' then id_type
  when lower(coalesce(document_type, '')) = 'cpf' then 'aadhaar'
  when lower(coalesce(document_type, '')) = 'cnpj' then 'pan'
  when coalesce(document_type, '') <> '' then lower(document_type)
  else id_type
end;

update public.customers
set id_value = coalesce(nullif(id_value, ''), nullif(document_value, ''))
where coalesce(nullif(id_value, ''), '') = '';

-- Keep domain controlled
alter table public.customers drop constraint if exists customers_id_type_check;
alter table public.customers
  add constraint customers_id_type_check
  check (id_type is null or id_type in ('aadhaar', 'pan'));

create index if not exists idx_customers_postal_code on public.customers (postal_code);
create index if not exists idx_customers_id_type on public.customers (id_type);
