-- 20260523000000_faido_billing_subscriptions.sql
-- DailyDue: production subscription billing schema + limits + RLS + storage bucket policies
-- Idempotent where possible.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto;

-- ============================================================================
-- Helpers
-- ============================================================================
-- drop function if exists public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  business_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  -- legacy rename: user_id -> id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'id'
  ) then
    alter table public.profiles rename column user_id to id;
  end if;
end $$;

alter table public.profiles
  add column if not exists id uuid;
alter table public.profiles
  add column if not exists display_name text;
alter table public.profiles
  add column if not exists business_name text;
alter table public.profiles
  add column if not exists phone text;
alter table public.profiles
  add column if not exists created_at timestamptz not null default now();
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  price_brl numeric(10,2) not null default 0,
  billing_interval text,
  max_customers integer,
  max_transactions_per_month integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans
  add column if not exists id text;
alter table public.subscription_plans
  add column if not exists name text;
alter table public.subscription_plans
  add column if not exists price_brl numeric(10,2) not null default 0;
alter table public.subscription_plans
  add column if not exists billing_interval text;
alter table public.subscription_plans
  add column if not exists max_customers integer;
alter table public.subscription_plans
  add column if not exists max_transactions_per_month integer;
alter table public.subscription_plans
  add column if not exists is_active boolean not null default true;
alter table public.subscription_plans
  add column if not exists created_at timestamptz not null default now();
alter table public.subscription_plans
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null check (status in ('free','pending','active','trialing','past_due','canceled','expired','refunded','revoked')),
  provider text check (provider in ('google_play','mercado_pago','manual_admin')),
  source_platform text check (source_platform in ('android','web','admin')),
  provider_product_id text,
  provider_customer_id text,
  provider_subscription_id text,
  provider_purchase_token text,
  provider_order_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_verified_at timestamptz,
  raw_provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_subscriptions
  add column if not exists plan_id text;
alter table public.user_subscriptions
  add column if not exists status text;
alter table public.user_subscriptions
  add column if not exists provider text;
alter table public.user_subscriptions
  add column if not exists source_platform text;
alter table public.user_subscriptions
  add column if not exists provider_product_id text;
alter table public.user_subscriptions
  add column if not exists provider_customer_id text;
alter table public.user_subscriptions
  add column if not exists provider_subscription_id text;
alter table public.user_subscriptions
  add column if not exists provider_purchase_token text;
alter table public.user_subscriptions
  add column if not exists provider_order_id text;
alter table public.user_subscriptions
  add column if not exists current_period_start timestamptz;
alter table public.user_subscriptions
  add column if not exists current_period_end timestamptz;
alter table public.user_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;
alter table public.user_subscriptions
  add column if not exists last_verified_at timestamptz;
alter table public.user_subscriptions
  add column if not exists raw_provider_status text;
alter table public.user_subscriptions
  add column if not exists created_at timestamptz not null default now();
alter table public.user_subscriptions
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_subscriptions' and column_name = 'user_id'
  ) then
    execute 'create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id)';
  end if;
end $$;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  event_type text not null,
  provider_event_id text,
  provider_subscription_id text,
  provider_payment_id text,
  provider_purchase_token text,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processing_error text,
  created_at timestamptz not null default now()
);

alter table public.payment_events
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.payment_events
  add column if not exists provider text;
alter table public.payment_events
  add column if not exists event_type text;
alter table public.payment_events
  add column if not exists provider_event_id text;
alter table public.payment_events
  add column if not exists provider_subscription_id text;
alter table public.payment_events
  add column if not exists provider_payment_id text;
alter table public.payment_events
  add column if not exists provider_purchase_token text;
alter table public.payment_events
  add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.payment_events
  add column if not exists processed boolean not null default false;
alter table public.payment_events
  add column if not exists processing_error text;
alter table public.payment_events
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'uniq_payment_events_provider_event'
  ) then
    execute 'create unique index uniq_payment_events_provider_event on public.payment_events(provider, provider_event_id) where provider_event_id is not null';
  end if;
end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  credit_limit numeric(12,2) not null default 0,
  picture_storage_path text,
  picture_mime_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill/compat: ensure required columns exist on existing deployments
alter table public.customers
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.customers
  add column if not exists name text;
alter table public.customers
  add column if not exists phone text;
alter table public.customers
  add column if not exists email text;
alter table public.customers
  add column if not exists address text;
alter table public.customers
  add column if not exists notes text;
alter table public.customers
  add column if not exists credit_limit numeric(12,2) not null default 0;
alter table public.customers
  add column if not exists picture_storage_path text;
alter table public.customers
  add column if not exists picture_mime_type text;
alter table public.customers
  add column if not exists is_active boolean not null default true;
alter table public.customers
  add column if not exists created_at timestamptz not null default now();
alter table public.customers
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  -- legacy rename: full_name -> name
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'full_name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'name'
  ) then
    alter table public.customers rename column full_name to name;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'user_id'
  ) then
    execute 'create index if not exists idx_customers_user_id on public.customers(user_id)';
  end if;
end $$;

create table if not exists public.customer_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('debt','payment')),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  transaction_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_transactions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.customer_transactions
  add column if not exists customer_id uuid references public.customers(id) on delete cascade;
alter table public.customer_transactions
  add column if not exists transaction_type text;
alter table public.customer_transactions
  add column if not exists amount numeric(12,2);
alter table public.customer_transactions
  add column if not exists description text;
alter table public.customer_transactions
  add column if not exists transaction_date timestamptz not null default now();
alter table public.customer_transactions
  add column if not exists created_at timestamptz not null default now();
alter table public.customer_transactions
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  -- legacy rename: type -> transaction_type
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_transactions' and column_name = 'type'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_transactions' and column_name = 'transaction_type'
  ) then
    alter table public.customer_transactions rename column type to transaction_type;
  end if;

  -- legacy rename: created_by -> user_id
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_transactions' and column_name = 'created_by'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_transactions' and column_name = 'user_id'
  ) then
    alter table public.customer_transactions rename column created_by to user_id;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_transactions' and column_name = 'user_id'
  ) then
    execute 'create index if not exists idx_customer_transactions_user_id on public.customer_transactions(user_id)';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_transactions' and column_name = 'customer_id'
  ) then
    execute 'create index if not exists idx_customer_transactions_customer_id on public.customer_transactions(customer_id)';
  end if;
end $$;

-- ============================================================================
-- Seeds
-- ============================================================================
insert into public.subscription_plans (id, name, price_brl, billing_interval, max_customers, max_transactions_per_month, is_active)
values ('free', 'Free', 0, null, 2, 20, true)
on conflict (id) do update set
  name = excluded.name,
  price_brl = excluded.price_brl,
  billing_interval = excluded.billing_interval,
  max_customers = excluded.max_customers,
  max_transactions_per_month = excluded.max_transactions_per_month,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.subscription_plans (id, name, price_brl, billing_interval, max_customers, max_transactions_per_month, is_active)
values ('premium_monthly', 'Premium Mensal', 11.99, 'monthly', null, null, true)
on conflict (id) do update set
  name = excluded.name,
  price_brl = excluded.price_brl,
  billing_interval = excluded.billing_interval,
  max_customers = excluded.max_customers,
  max_transactions_per_month = excluded.max_transactions_per_month,
  is_active = excluded.is_active,
  updated_at = now();

-- ============================================================================
-- View
-- ============================================================================
drop view if exists public.customer_balance_view;

create view public.customer_balance_view as
select
  c.*,
  coalesce(sum(case when t.transaction_type = 'debt' then t.amount else 0 end), 0)::numeric(12,2) as total_fiado,
  coalesce(sum(case when t.transaction_type = 'payment' then t.amount else 0 end), 0)::numeric(12,2) as total_baixa,
  (
    coalesce(sum(case when t.transaction_type = 'debt' then t.amount else 0 end), 0)
    - coalesce(sum(case when t.transaction_type = 'payment' then t.amount else 0 end), 0)
  )::numeric(12,2) as current_balance,
  case
    when (
      coalesce(sum(case when t.transaction_type = 'debt' then t.amount else 0 end), 0)
      - coalesce(sum(case when t.transaction_type = 'payment' then t.amount else 0 end), 0)
    ) <= 0 then 'paid'
    when c.credit_limit > 0 and (
      coalesce(sum(case when t.transaction_type = 'debt' then t.amount else 0 end), 0)
      - coalesce(sum(case when t.transaction_type = 'payment' then t.amount else 0 end), 0)
    ) > c.credit_limit then 'over_limit'
    else 'open'
  end as balance_status
from public.customers c
left join public.customer_transactions t on t.customer_id = c.id
group by c.id;

-- ============================================================================
-- Functions / RPC
-- ============================================================================

drop function if exists public.get_current_plan();
create or replace function public.get_current_plan()
returns table (
  plan_id text,
  plan_name text,
  price_brl numeric,
  max_customers integer,
  max_transactions_per_month integer,
  is_premium boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with active_sub as (
    select us.plan_id
    from public.user_subscriptions us
    where us.user_id = auth.uid()
      and (us.status = 'active' or us.status = 'trialing')
      and (us.current_period_end is null or us.current_period_end > now())
    order by us.updated_at desc
    limit 1
  )
  select
    sp.id as plan_id,
    sp.name as plan_name,
    sp.price_brl,
    sp.max_customers,
    sp.max_transactions_per_month,
    (sp.id = 'premium_monthly') as is_premium
  from public.subscription_plans sp
  where sp.id = coalesce((select plan_id from active_sub), 'free')
  limit 1;
$$;

drop function if exists public.can_create_customer();
create or replace function public.can_create_customer()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  active_count integer;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into p from public.get_current_plan() limit 1;
  if p.max_customers is null then
    return true;
  end if;

  select count(*) into active_count
  from public.customers
  where user_id = auth.uid()
    and is_active = true;

  if active_count < p.max_customers then
    return true;
  end if;

  raise exception 'Seu plano grátis permite até 2 clientes. Assine o Premium por R$11,99/mês para cadastrar clientes ilimitados.' using errcode = 'P0001';
end;
$$;

drop function if exists public.can_create_transaction();
create or replace function public.can_create_transaction()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  used_count integer;
  start_month timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into p from public.get_current_plan() limit 1;
  if p.max_transactions_per_month is null then
    return true;
  end if;

  start_month := date_trunc('month', now());
  select count(*) into used_count
  from public.customer_transactions
  where user_id = auth.uid()
    and transaction_date >= start_month;

  if used_count < p.max_transactions_per_month then
    return true;
  end if;

  raise exception 'Você atingiu o limite de Fiado/Baixa do plano grátis. Assine o Premium por R$11,99/mês para usar sem limites.' using errcode = 'P0001';
end;
$$;

drop function if exists public.create_customer_secure(text, text, text, text, text, numeric, text, text);
create or replace function public.create_customer_secure(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null,
  p_credit_limit numeric default 0,
  p_picture_storage_path text default null,
  p_picture_mime_type text default null
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row public.customers;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform public.can_create_customer();

  insert into public.customers (user_id, name, phone, email, address, notes, credit_limit, picture_storage_path, picture_mime_type, is_active)
  values (
    auth.uid(),
    p_name,
    regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g'),
    nullif(p_email, ''),
    nullif(p_address, ''),
    p_notes,
    coalesce(p_credit_limit, 0),
    nullif(p_picture_storage_path, ''),
    nullif(p_picture_mime_type, ''),
    true
  )
  returning * into new_row;

  return new_row;
end;
$$;

drop function if exists public.create_customer_transaction_secure(uuid, text, numeric, text);
create or replace function public.create_customer_transaction_secure(
  p_customer_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_description text default null
)
returns public.customer_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  cust_owner uuid;
  new_tx public.customer_transactions;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select c.user_id into cust_owner
  from public.customers c
  where c.id = p_customer_id
  limit 1;

  if cust_owner is null then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if cust_owner <> auth.uid() then
    raise exception 'CUSTOMER_NOT_OWNED';
  end if;

  perform public.can_create_transaction();

  insert into public.customer_transactions (user_id, customer_id, transaction_type, amount, description)
  values (
    auth.uid(),
    p_customer_id,
    p_transaction_type,
    p_amount,
    nullif(p_description, '')
  )
  returning * into new_tx;

  return new_tx;
end;
$$;

-- ============================================================================
-- Triggers (updated_at)
-- ============================================================================
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists trg_subscription_plans_updated_at on public.subscription_plans;
create trigger trg_subscription_plans_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();

drop trigger if exists trg_user_subscriptions_updated_at on public.user_subscriptions;
create trigger trg_user_subscriptions_updated_at before update on public.user_subscriptions for each row execute function public.set_updated_at();

drop trigger if exists trg_payment_events_updated_at on public.payment_events;
create trigger trg_payment_events_updated_at before update on public.payment_events for each row execute function public.set_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_transactions_updated_at on public.customer_transactions;
create trigger trg_customer_transactions_updated_at before update on public.customer_transactions for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.customers enable row level security;
alter table public.customer_transactions enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- user_subscriptions
drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
drop policy if exists "user_subscriptions_service_role_all" on public.user_subscriptions;
create policy "user_subscriptions_select_own" on public.user_subscriptions for select using (user_id = auth.uid());
create policy "user_subscriptions_service_role_all" on public.user_subscriptions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- payment_events
drop policy if exists "payment_events_service_role_all" on public.payment_events;
create policy "payment_events_service_role_all" on public.payment_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- customers (block direct insert; use RPC)
drop policy if exists "customers_select_own" on public.customers;
drop policy if exists "customers_update_own" on public.customers;
drop policy if exists "customers_delete_own" on public.customers;
drop policy if exists "customers_deny_direct_insert" on public.customers;
create policy "customers_select_own" on public.customers for select using (user_id = auth.uid());
create policy "customers_update_own" on public.customers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers_delete_own" on public.customers for delete using (user_id = auth.uid());
create policy "customers_deny_direct_insert" on public.customers for insert with check (false);

-- customer_transactions (block direct insert; use RPC)
drop policy if exists "customer_transactions_select_own" on public.customer_transactions;
drop policy if exists "customer_transactions_delete_own" on public.customer_transactions;
drop policy if exists "customer_transactions_deny_direct_insert" on public.customer_transactions;
create policy "customer_transactions_select_own" on public.customer_transactions for select using (user_id = auth.uid());
create policy "customer_transactions_delete_own" on public.customer_transactions for delete using (user_id = auth.uid());
create policy "customer_transactions_deny_direct_insert" on public.customer_transactions for insert with check (false);

-- ============================================================================
-- Storage bucket: customer-pictures (private) + policies
-- ============================================================================
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'customer-pictures') then
    insert into storage.buckets (id, name, public) values ('customer-pictures', 'customer-pictures', false);
  else
    update storage.buckets set public = false where id = 'customer-pictures';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    execute 'update storage.buckets set file_size_limit = 5242880 where id = ''customer-pictures''';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    execute 'update storage.buckets set allowed_mime_types = array[''image/jpeg'',''image/png'',''image/webp''] where id = ''customer-pictures''';
  end if;
end $$;

drop policy if exists "customer_pictures_read_own" on storage.objects;
drop policy if exists "customer_pictures_insert_own" on storage.objects;
drop policy if exists "customer_pictures_update_own" on storage.objects;
drop policy if exists "customer_pictures_delete_own" on storage.objects;

create policy "customer_pictures_read_own" on storage.objects for select
using (
  bucket_id = 'customer-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "customer_pictures_insert_own" on storage.objects for insert
with check (
  bucket_id = 'customer-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "customer_pictures_update_own" on storage.objects for update
using (
  bucket_id = 'customer-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'customer-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "customer_pictures_delete_own" on storage.objects for delete
using (
  bucket_id = 'customer-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- Grants
-- ============================================================================
grant select on public.profiles to authenticated;
grant select on public.user_subscriptions to authenticated;
grant select on public.customers to authenticated;
grant select on public.customer_transactions to authenticated;
grant select on public.customer_balance_view to authenticated;

revoke insert, update, delete on public.user_subscriptions from authenticated;
revoke select, insert, update, delete on public.payment_events from authenticated;

grant execute on function public.get_current_plan() to authenticated;
grant execute on function public.can_create_customer() to authenticated;
grant execute on function public.can_create_transaction() to authenticated;
grant execute on function public.create_customer_secure(text, text, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.create_customer_transaction_secure(uuid, text, numeric, text) to authenticated;
