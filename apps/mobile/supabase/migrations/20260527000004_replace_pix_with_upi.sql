-- India-first payment identifier migration.
-- Keep compatibility with legacy PIX naming while moving source-of-truth to upi_id.

alter table public.businesses add column if not exists upi_id text;

-- Backfill upi_id from legacy pix_key when available.
update public.businesses
set upi_id = coalesce(nullif(upi_id, ''), nullif(pix_key, ''))
where coalesce(nullif(upi_id, ''), '') = '';

-- Remove legacy values from pix_key to avoid BR naming in active data.
update public.businesses
set pix_key = null
where pix_key is not null;

-- Keep old clients safe: if they still write pix_key, mirror into upi_id and clear pix_key.
create or replace function public.sync_business_upi_from_pix()
returns trigger
language plpgsql
as $$
begin
  if coalesce(nullif(new.upi_id, ''), '') = '' and coalesce(nullif(new.pix_key, ''), '') <> '' then
    new.upi_id := new.pix_key;
  end if;

  -- Legacy column is deprecated; keep it empty.
  new.pix_key := null;
  return new;
end;
$$;

drop trigger if exists trg_sync_business_upi_from_pix on public.businesses;
create trigger trg_sync_business_upi_from_pix
before insert or update on public.businesses
for each row execute function public.sync_business_upi_from_pix();

