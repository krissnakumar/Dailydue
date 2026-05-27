-- =====================================================
-- FAIDO MOBILE - PRODUCTION DATABASE UPGRADE
-- =====================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1) Upgrade public.businesses
alter table public.businesses
add column if not exists logo_url text,
add column if not exists subscription_status text default 'trial',
add column if not exists subscription_plan text default 'free',
add column if not exists trial_ends_at timestamptz,
add column if not exists is_active boolean default true,
add column if not exists updated_at timestamptz default now();

-- 2) Upgrade public.users (legacy table - optional)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    execute $stmt$
      alter table public.users
      add column if not exists avatar_url text,
      add column if not exists last_seen_at timestamptz,
      add column if not exists is_active boolean default true,
      add column if not exists updated_at timestamptz default now()
    $stmt$;
  end if;
end $$;

-- 3) Upgrade public.customers
alter table public.customers
add column if not exists sync_id text,
add column if not exists archived boolean default false,
add column if not exists updated_at timestamptz default now();

create unique index if not exists idx_customer_phone_business
on public.customers (business_id, phone)
where (phone is not null and phone != '');

create index if not exists idx_customers_business_debt
on public.customers (business_id, total_debt desc);

-- 4) Upgrade public.transactions (legacy table - optional)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transactions'
  ) then
    execute $stmt$
      alter table public.transactions
      add column if not exists offline_created boolean default false,
      add column if not exists sync_status text default 'pending',
      add column if not exists external_id text,
      add column if not exists archived boolean default false,
      add column if not exists updated_at timestamptz default now()
    $stmt$;

    execute 'create index if not exists idx_transactions_business_customer on public.transactions (business_id, customer_id)';
  end if;
end $$;

-- 5) Upgrade public.quick_items
alter table public.quick_items
add column if not exists category text,
add column if not exists updated_at timestamptz default now();

-- 6) Upgrade public.whatsapp_logs
alter table public.whatsapp_logs
add column if not exists provider_message_id text,
add column if not exists error_message text,
add column if not exists updated_at timestamptz default now();

-- 7) Subscriptions table
create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    business_id uuid references public.businesses(id) on delete cascade,
    provider text not null,
    provider_subscription_id text,
    plan text not null,
    status text not null,
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 8) Completed usage_monthly table definition
create table if not exists public.usage_monthly (
    id uuid primary key default gen_random_uuid(),
    business_id uuid references public.businesses(id) on delete cascade,
    month text not null, -- Format YYYY-MM
    whatsapp_sent_count integer default 0,
    transactions_created_count integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(business_id, month)
);
