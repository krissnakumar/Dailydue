-- Fiado production contract repair.
-- Keeps older installs compatible with the current Expo app and Google Play flow.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Business/profile compatibility
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'Meu Estabelecimento',
  owner_name text not null default 'Dono',
  phone text,
  pix_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists business_id uuid;
alter table public.profiles add column if not exists role text not null default 'owner';
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists avatar_storage_path text;
alter table public.profiles add column if not exists avatar_mime_type text;

create or replace function public.get_current_business_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.business_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.bootstrap_owner_profile(
  p_business_name text,
  p_owner_name text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_business_id uuid;
  new_business_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select business_id into existing_business_id
  from public.profiles
  where id = auth.uid()
  limit 1;

  if existing_business_id is not null then
    return existing_business_id;
  end if;

  insert into public.businesses (business_name, owner_name, phone)
  values (
    coalesce(nullif(p_business_name, ''), 'Meu Estabelecimento'),
    coalesce(nullif(p_owner_name, ''), 'Dono'),
    nullif(p_phone, '')
  )
  returning id into new_business_id;

  insert into public.profiles (id, business_id, role, full_name, display_name, phone)
  values (
    auth.uid(),
    new_business_id,
    'owner',
    nullif(p_owner_name, ''),
    nullif(p_owner_name, ''),
    nullif(p_phone, '')
  )
  on conflict (id) do update set
    business_id = coalesce(public.profiles.business_id, excluded.business_id),
    role = coalesce(public.profiles.role, excluded.role),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    updated_at = now();

  return new_business_id;
end;
$$;

drop function if exists public.update_owner_profile(text, text, text, text, text, text, boolean);
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
      coalesce(nullif(p_business_name, ''), 'Meu Estabelecimento'),
      coalesce(nullif(p_full_name, ''), 'Dono'),
      p_phone
    );
  else
    resolved_business_id := existing_business_id;
  end if;

  update public.profiles p
  set
    full_name = coalesce(nullif(p_full_name, ''), p.full_name),
    display_name = coalesce(nullif(p_full_name, ''), p.display_name),
    phone = case when p_phone is null then p.phone else nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') end,
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
    phone = case when p_phone is null then b.phone else nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') end,
    pix_key = case when p_pix_key is null then b.pix_key else nullif(p_pix_key, '') end,
    updated_at = now()
  where b.id = resolved_business_id;

  return query
  select
    p.id,
    p.business_id,
    p.full_name,
    b.business_name,
    p.phone,
    b.pix_key,
    p.avatar_storage_path,
    p.avatar_mime_type
  from public.profiles p
  left join public.businesses b on b.id = p.business_id
  where p.id = auth.uid()
  limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ensure base subscription and event tables exist
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id text primary key,
  name text not null default 'Plan',
  price_brl numeric(10,2) not null default 0,
  billing_interval text,
  max_customers integer,
  max_transactions_per_month integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text references public.subscription_plans(id),
  status text not null default 'free',
  provider text,
  source_platform text,
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

-- ---------------------------------------------------------------------------
-- Subscription schema compatibility
-- ---------------------------------------------------------------------------
alter table public.subscription_plans add column if not exists name text;
alter table public.subscription_plans add column if not exists price_brl numeric(10,2) not null default 0;
alter table public.subscription_plans add column if not exists billing_interval text;
alter table public.subscription_plans add column if not exists max_customers integer;
alter table public.subscription_plans add column if not exists max_transactions_per_month integer;
alter table public.subscription_plans add column if not exists is_active boolean not null default true;
alter table public.subscription_plans add column if not exists updated_at timestamptz not null default now();

insert into public.subscription_plans (id, name, price_brl, billing_interval, max_customers, max_transactions_per_month, is_active)
values
  ('free', 'Free', 0, null, 2, 30, true),
  ('premium_monthly', 'Premium Mensal', 11.99, 'monthly', null, null, true)
on conflict (id) do update set
  name = excluded.name,
  price_brl = excluded.price_brl,
  billing_interval = excluded.billing_interval,
  max_customers = excluded.max_customers,
  max_transactions_per_month = excluded.max_transactions_per_month,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.user_subscriptions add column if not exists plan_id text;
alter table public.user_subscriptions add column if not exists plan text;
alter table public.user_subscriptions add column if not exists status text not null default 'free';
alter table public.user_subscriptions add column if not exists provider text;
alter table public.user_subscriptions add column if not exists source_platform text;
alter table public.user_subscriptions add column if not exists provider_product_id text;
alter table public.user_subscriptions add column if not exists provider_customer_id text;
alter table public.user_subscriptions add column if not exists provider_subscription_id text;
alter table public.user_subscriptions add column if not exists provider_purchase_token text;
alter table public.user_subscriptions add column if not exists provider_order_id text;
alter table public.user_subscriptions add column if not exists current_period_start timestamptz;
alter table public.user_subscriptions add column if not exists current_period_end timestamptz;
alter table public.user_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.user_subscriptions add column if not exists last_verified_at timestamptz;
alter table public.user_subscriptions add column if not exists raw_provider_status text;
alter table public.user_subscriptions add column if not exists updated_at timestamptz not null default now();

update public.user_subscriptions
set plan_id = coalesce(plan_id, plan, 'free'),
    plan = coalesce(plan, plan_id, 'free'),
    status = coalesce(status, 'free');

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.user_subscriptions'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%status%'
        or pg_get_constraintdef(oid) ilike '%provider%'
        or pg_get_constraintdef(oid) ilike '%source_platform%'
      )
  loop
    execute format('alter table public.user_subscriptions drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.user_subscriptions drop constraint if exists user_subscriptions_status_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_status_check
  check (status in ('free','pending','active','trialing','past_due','canceled','expired','refunded','revoked'));

alter table public.user_subscriptions drop constraint if exists user_subscriptions_provider_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_provider_check
  check (provider is null or provider in ('google_play','mercado_pago','manual_admin'));

alter table public.user_subscriptions drop constraint if exists user_subscriptions_source_platform_check;
alter table public.user_subscriptions
  add constraint user_subscriptions_source_platform_check
  check (source_platform is null or source_platform in ('android','web','admin'));

delete from public.user_subscriptions us
where us.ctid in (
  select ctid
  from (
    select
      ctid,
      row_number() over (
        partition by user_id
        order by coalesce(updated_at, created_at) desc nulls last, created_at desc nulls last, id desc
      ) as rn
    from public.user_subscriptions
  ) ranked
  where ranked.rn > 1
);

create unique index if not exists uniq_user_subscriptions_user_id
  on public.user_subscriptions(user_id);

-- ---------------------------------------------------------------------------
-- Customer/transaction compatibility
-- ---------------------------------------------------------------------------
alter table public.customers add column if not exists business_id uuid;
alter table public.customers add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.customers add column if not exists name text;
alter table public.customers add column if not exists full_name text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists credit_limit numeric(12,2) not null default 0;
alter table public.customers add column if not exists picture_storage_path text;
alter table public.customers add column if not exists picture_mime_type text;
alter table public.customers add column if not exists is_active boolean not null default true;
alter table public.customers add column if not exists updated_at timestamptz not null default now();

update public.customers
set name = coalesce(nullif(name, ''), nullif(full_name, ''), 'Cliente'),
    full_name = coalesce(nullif(full_name, ''), nullif(name, ''), 'Cliente');

update public.customers c
set business_id = p.business_id
from public.profiles p
where c.business_id is null
  and c.user_id = p.id
  and p.business_id is not null;

alter table public.customer_transactions add column if not exists business_id uuid;
alter table public.customer_transactions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.customer_transactions add column if not exists created_by uuid;
alter table public.customer_transactions add column if not exists customer_id uuid references public.customers(id) on delete cascade;
alter table public.customer_transactions add column if not exists type text;
alter table public.customer_transactions add column if not exists transaction_type text;
alter table public.customer_transactions add column if not exists amount numeric(12,2);
alter table public.customer_transactions add column if not exists description text;
alter table public.customer_transactions add column if not exists transaction_date timestamptz not null default now();
alter table public.customer_transactions add column if not exists updated_at timestamptz not null default now();

update public.customer_transactions t
set transaction_type = coalesce(t.transaction_type, t.type),
    type = coalesce(t.type, t.transaction_type),
    user_id = coalesce(t.user_id, t.created_by),
    created_by = coalesce(t.created_by, t.user_id),
    business_id = coalesce(t.business_id, c.business_id)
from public.customers c
where t.customer_id = c.id;

create or replace function public.sync_customer_compat_columns()
returns trigger
language plpgsql
as $$
begin
  new.name := coalesce(nullif(new.name, ''), nullif(new.full_name, ''), 'Cliente');
  new.full_name := coalesce(nullif(new.full_name, ''), nullif(new.name, ''), 'Cliente');
  return new;
end;
$$;

drop trigger if exists trg_sync_customer_compat_columns on public.customers;
create trigger trg_sync_customer_compat_columns
before insert or update on public.customers
for each row execute function public.sync_customer_compat_columns();

create or replace function public.sync_transaction_compat_columns()
returns trigger
language plpgsql
as $$
begin
  new.transaction_type := coalesce(nullif(new.transaction_type, ''), nullif(new.type, ''));
  new.type := coalesce(nullif(new.type, ''), nullif(new.transaction_type, ''));
  new.user_id := coalesce(new.user_id, new.created_by);
  new.created_by := coalesce(new.created_by, new.user_id);
  if new.transaction_date is null then
    new.transaction_date := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_transaction_compat_columns on public.customer_transactions;
create trigger trg_sync_transaction_compat_columns
before insert or update on public.customer_transactions
for each row execute function public.sync_transaction_compat_columns();

-- ---------------------------------------------------------------------------
-- App-facing RPCs
-- ---------------------------------------------------------------------------
drop function if exists public.get_current_plan();
create or replace function public.get_current_plan()
returns table (
  plan_id text,
  plan_name text,
  price_brl numeric,
  max_customers integer,
  max_transactions_per_month integer,
  is_premium boolean,
  status text,
  current_period_end timestamptz,
  source text
)
language sql
security definer
set search_path = public
stable
as $$
  with active_sub as (
    select
      coalesce(us.plan_id, us.plan, 'free') as resolved_plan_id,
      us.status,
      us.current_period_end,
      us.provider,
      us.updated_at
    from public.user_subscriptions us
    where us.user_id = auth.uid()
      and us.status in ('active', 'trialing')
      and (us.current_period_end is null or us.current_period_end > now())
    order by us.updated_at desc nulls last, us.created_at desc nulls last
    limit 1
  )
  select
    sp.id as plan_id,
    sp.name as plan_name,
    sp.price_brl,
    sp.max_customers,
    sp.max_transactions_per_month,
    (sp.id = 'premium_monthly') as is_premium,
    coalesce((select status from active_sub), 'free') as status,
    (select current_period_end from active_sub) as current_period_end,
    coalesce((select provider from active_sub), 'cloud') as source
  from public.subscription_plans sp
  where sp.id = coalesce((select resolved_plan_id from active_sub), 'free')
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
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into p from public.get_current_plan() limit 1;
  if p.max_transactions_per_month is null then
    return true;
  end if;

  select count(*) into used_count
  from public.customer_transactions
  where user_id = auth.uid()
    and transaction_date >= date_trunc('month', now());

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

  insert into public.customers (
    user_id,
    business_id,
    name,
    full_name,
    phone,
    email,
    address,
    notes,
    credit_limit,
    picture_storage_path,
    picture_mime_type,
    is_active
  )
  values (
    auth.uid(),
    public.get_current_business_id(),
    p_name,
    p_name,
    regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'),
    nullif(p_email, ''),
    nullif(p_address, ''),
    nullif(p_notes, ''),
    coalesce(p_credit_limit, 0),
    nullif(p_picture_storage_path, ''),
    nullif(p_picture_mime_type, ''),
    true
  )
  returning * into new_row;

  return new_row;
end;
$$;

drop function if exists public.update_customer_enforced(uuid, text, text, text, text, text, numeric, text, text, boolean);
create or replace function public.update_customer_enforced(
  p_customer_id uuid,
  p_name text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null,
  p_credit_limit numeric default null,
  p_picture_storage_path text default null,
  p_picture_mime_type text default null,
  p_clear_photo boolean default false
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.customers;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.customers c
  set
    name = coalesce(p_name, c.name),
    full_name = coalesce(p_name, c.full_name),
    phone = case when p_phone is null then c.phone else regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') end,
    email = case when p_email is null then c.email else nullif(p_email, '') end,
    address = case when p_address is null then c.address else nullif(p_address, '') end,
    notes = case when p_notes is null then c.notes else nullif(p_notes, '') end,
    credit_limit = coalesce(p_credit_limit, c.credit_limit),
    picture_storage_path = case when p_clear_photo then null when p_picture_storage_path is null then c.picture_storage_path else nullif(p_picture_storage_path, '') end,
    picture_mime_type = case when p_clear_photo then null when p_picture_mime_type is null then c.picture_mime_type else nullif(p_picture_mime_type, '') end,
    updated_at = now()
  where c.id = p_customer_id
    and c.user_id = auth.uid()
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'CUSTOMER_NOT_FOUND_OR_NOT_OWNED';
  end if;

  return updated_row;
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
  cust public.customers;
  new_tx public.customer_transactions;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into cust
  from public.customers c
  where c.id = p_customer_id
  limit 1;

  if cust.id is null then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if cust.user_id <> auth.uid() then
    raise exception 'CUSTOMER_NOT_OWNED';
  end if;
  if p_transaction_type not in ('debt', 'payment') then
    raise exception 'INVALID_TRANSACTION_TYPE';
  end if;

  perform public.can_create_transaction();

  insert into public.customer_transactions (
    business_id,
    user_id,
    created_by,
    customer_id,
    type,
    transaction_type,
    amount,
    description
  )
  values (
    cust.business_id,
    auth.uid(),
    auth.uid(),
    p_customer_id,
    p_transaction_type,
    p_transaction_type,
    p_amount,
    nullif(p_description, '')
  )
  returning * into new_tx;

  return new_tx;
end;
$$;

-- ---------------------------------------------------------------------------
-- View/RLS/grants
-- ---------------------------------------------------------------------------
drop view if exists public.customer_balance_view;
create view public.customer_balance_view as
select
  c.id as customer_id,
  c.id,
  c.user_id,
  c.business_id,
  c.name,
  c.full_name,
  c.phone,
  c.email,
  c.address,
  c.notes,
  c.credit_limit,
  c.picture_storage_path,
  c.picture_mime_type,
  c.is_active,
  c.created_at,
  c.updated_at,
  coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'debt' then t.amount else 0 end), 0)::numeric(12,2) as total_fiado,
  coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'payment' then t.amount else 0 end), 0)::numeric(12,2) as total_baixa,
  (
    coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'debt' then t.amount else 0 end), 0)
    - coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'payment' then t.amount else 0 end), 0)
  )::numeric(12,2) as current_balance,
  case
    when (
      coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'debt' then t.amount else 0 end), 0)
      - coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'payment' then t.amount else 0 end), 0)
    ) <= 0 then 'paid'
    when c.credit_limit > 0 and (
      coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'debt' then t.amount else 0 end), 0)
      - coalesce(sum(case when coalesce(t.transaction_type, t.type) = 'payment' then t.amount else 0 end), 0)
    ) > c.credit_limit then 'over_limit'
    else 'open'
  end as balance_status
from public.customers c
left join public.customer_transactions t on t.customer_id = c.id
group by c.id;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.customers enable row level security;
alter table public.customer_transactions enable row level security;

drop policy if exists "businesses_select_own" on public.businesses;
create policy "businesses_select_own" on public.businesses
for select using (id = public.get_current_business_id());

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
drop policy if exists "user_subscriptions_service_role_all" on public.user_subscriptions;
create policy "user_subscriptions_select_own" on public.user_subscriptions for select using (user_id = auth.uid());
create policy "user_subscriptions_service_role_all" on public.user_subscriptions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "payment_events_service_role_all" on public.payment_events;
create policy "payment_events_service_role_all" on public.payment_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "customers_select_own" on public.customers;
drop policy if exists "customers_update_own" on public.customers;
drop policy if exists "customers_delete_own" on public.customers;
drop policy if exists "customers_deny_direct_insert" on public.customers;
create policy "customers_select_own" on public.customers for select using (user_id = auth.uid());
create policy "customers_update_own" on public.customers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers_delete_own" on public.customers for delete using (user_id = auth.uid());
create policy "customers_deny_direct_insert" on public.customers for insert with check (false);

drop policy if exists "customer_transactions_select_own" on public.customer_transactions;
drop policy if exists "customer_transactions_delete_own" on public.customer_transactions;
drop policy if exists "customer_transactions_deny_direct_insert" on public.customer_transactions;
create policy "customer_transactions_select_own" on public.customer_transactions for select using (user_id = auth.uid());
create policy "customer_transactions_delete_own" on public.customer_transactions for delete using (user_id = auth.uid());
create policy "customer_transactions_deny_direct_insert" on public.customer_transactions for insert with check (false);

-- Owner profile pictures are private and scoped to {user_id}/avatar.ext.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'owner-pictures') then
    insert into storage.buckets (id, name, public) values ('owner-pictures', 'owner-pictures', false);
  else
    update storage.buckets set public = false where id = 'owner-pictures';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    execute 'update storage.buckets set file_size_limit = 5242880 where id = ''owner-pictures''';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    execute 'update storage.buckets set allowed_mime_types = array[''image/jpeg'',''image/png'',''image/webp''] where id = ''owner-pictures''';
  end if;
end $$;

drop policy if exists "owner_pictures_read_own" on storage.objects;
drop policy if exists "owner_pictures_insert_own" on storage.objects;
drop policy if exists "owner_pictures_update_own" on storage.objects;
drop policy if exists "owner_pictures_delete_own" on storage.objects;

create policy "owner_pictures_read_own" on storage.objects for select
using (
  bucket_id = 'owner-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner_pictures_insert_own" on storage.objects for insert
with check (
  bucket_id = 'owner-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner_pictures_update_own" on storage.objects for update
using (
  bucket_id = 'owner-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'owner-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "owner_pictures_delete_own" on storage.objects for delete
using (
  bucket_id = 'owner-pictures'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant select on public.businesses to authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_subscriptions to authenticated;
grant select on public.customers to authenticated;
grant select on public.customer_transactions to authenticated;
grant select on public.customer_balance_view to authenticated;

grant execute on function public.get_current_business_id() to authenticated;
grant execute on function public.bootstrap_owner_profile(text, text, text) to authenticated;
grant execute on function public.update_owner_profile(text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.get_current_plan() to authenticated;
grant execute on function public.can_create_customer() to authenticated;
grant execute on function public.can_create_transaction() to authenticated;
grant execute on function public.create_customer_secure(text, text, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.update_customer_enforced(uuid, text, text, text, text, text, numeric, text, text, boolean) to authenticated;
grant execute on function public.create_customer_transaction_secure(uuid, text, numeric, text) to authenticated;
