-- Fix cloud profile save issues seen in the Expo app:
-- 1) Some installs still have `businesses.phone` as NOT NULL + UNIQUE (from 20260514000000_initial_schema.sql),
--    which breaks profile updates when the owner phone matches another business or when we clear the phone.
-- 2) Some installs have `profiles` without `updated_at`, but the RPC `update_owner_profile()` updates it.

-- ---------------------------------------------------------------------------
-- Ensure profiles timestamps exist (and updated_at trigger works)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Relax businesses.phone constraints for compatibility
-- ---------------------------------------------------------------------------
alter table public.businesses
  alter column phone drop not null;

alter table public.businesses
  drop constraint if exists businesses_phone_key;

-- ---------------------------------------------------------------------------
-- Ensure businesses timestamps exist (update_owner_profile() updates updated_at)
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists created_at timestamptz not null default now();

alter table public.businesses
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
before update on public.businesses
for each row
execute function public.set_updated_at();
