-- Final cleanup: remove legacy PIX column and keep API compatibility with India UPI.

-- Ensure target column exists.
alter table public.businesses add column if not exists upi_id text;

-- Backfill once more before dropping legacy column.
update public.businesses
set upi_id = coalesce(nullif(upi_id, ''), nullif(pix_key, ''))
where coalesce(nullif(upi_id, ''), '') = '';

-- Remove compatibility trigger/function that depend on pix_key.
drop trigger if exists trg_sync_business_upi_from_pix on public.businesses;
drop function if exists public.sync_business_upi_from_pix();

-- Replace owner profile RPC to write/read upi_id while preserving old parameter name p_pix_key
-- so current clients continue working.
create or replace function public.update_owner_profile(
  p_full_name text default null,
  p_business_name text default null,
  p_phone text default null,
  p_pix_key text default null,
  p_avatar_storage_path text default null,
  p_avatar_mime_type text default null,
  p_clear_avatar boolean default false
)
returns table (
  profile_id uuid,
  business_id uuid,
  full_name text,
  business_name text,
  phone text,
  pix_key text,
  avatar_storage_path text,
  avatar_mime_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_business_id uuid;
  resolved_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.business_id into existing_business_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if existing_business_id is null then
    resolved_business_id := public.bootstrap_owner_profile(
      coalesce(nullif(p_business_name, ''), 'My Store'),
      coalesce(nullif(p_full_name, ''), 'Owner'),
      p_phone
    );
  else
    resolved_business_id := existing_business_id;
  end if;

  update public.profiles p
  set
    full_name = coalesce(nullif(p_full_name, ''), p.full_name),
    display_name = coalesce(nullif(p_full_name, ''), p.display_name),
    phone = case when p_phone is null then p.phone else nullif(regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g'), '') end,
    avatar_storage_path = case
      when p_clear_avatar then null
      when p_avatar_storage_path is null then p.avatar_storage_path
      else nullif(p_avatar_storage_path, '')
    end,
    avatar_mime_type = case
      when p_clear_avatar then null
      when p_avatar_mime_type is null then p.avatar_mime_type
      else nullif(p_avatar_mime_type, '')
    end,
    updated_at = now()
  where p.id = auth.uid();

  update public.businesses b
  set
    business_name = coalesce(nullif(p_business_name, ''), b.business_name),
    owner_name = coalesce(nullif(p_full_name, ''), b.owner_name),
    phone = case when p_phone is null then b.phone else nullif(regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g'), '') end,
    upi_id = case when p_pix_key is null then b.upi_id else nullif(p_pix_key, '') end,
    updated_at = now()
  where b.id = resolved_business_id;

  return query
  select
    p.id,
    p.business_id,
    p.full_name,
    b.business_name,
    p.phone,
    b.upi_id as pix_key,
    p.avatar_storage_path,
    p.avatar_mime_type
  from public.profiles p
  left join public.businesses b on b.id = p.business_id
  where p.id = auth.uid()
  limit 1;
end;
$$;

-- Drop legacy column.
alter table public.businesses drop column if exists pix_key;
