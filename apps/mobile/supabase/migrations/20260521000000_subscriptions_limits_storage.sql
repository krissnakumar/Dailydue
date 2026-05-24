-- ====================================================================
-- SUPABASE MIGRATION: Subscriptions, Limits Enforcement, Storage Photos
-- Projeto: Controle de Fiado (Idempotente)
-- ====================================================================

-- 0) Compatibility: rename legacy tables to requested names
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    alter table public.users rename to profiles;
  end if;
exception when others then
  -- keep going; migration is idempotent across partial deployments
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transactions')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customer_transactions') then
    alter table public.transactions rename to customer_transactions;
  end if;
exception when others then
end $$;

-- 1) Customers: add active flag + switch to storage path
alter table public.customers
  add column if not exists is_active boolean not null default true;

alter table public.customers
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.customers
  add column if not exists email text;

alter table public.customers
  add column if not exists address text;

alter table public.customers
  add column if not exists credit_limit numeric(12, 2);

alter table public.customers
  add column if not exists picture_storage_path text;

alter table public.customers
  add column if not exists picture_mime_type text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'photo_url'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'photo_path'
  ) then
    alter table public.customers rename column photo_url to photo_path;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'photo_path'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'picture_storage_path'
  ) then
    -- legacy column migration
    alter table public.customers rename column photo_path to picture_storage_path;
  end if;
end $$;

-- 2) Subscriptions: source of truth from provider webhooks (in production)
create table if not exists public.user_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'premium_monthly')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled')),
  current_period_end timestamptz,
  provider text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_user_id on public.user_subscriptions(user_id);

alter table public.user_subscriptions enable row level security;

drop policy if exists "Select own subscription" on public.user_subscriptions;
drop policy if exists "Service role manages subscriptions" on public.user_subscriptions;

create policy "Select own subscription"
  on public.user_subscriptions for select
  using (user_id = auth.uid());

create policy "Service role manages subscriptions"
  on public.user_subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 3) Plan resolution
create or replace function public.get_current_plan(user_uuid uuid)
returns table (
  plan_id text,
  plan_name text,
  price_brl numeric,
  max_customers integer,
  max_transactions_per_month integer,
  is_premium boolean
)
language plpgsql security definer set search_path = public
stable
as $$
declare
  is_premium_active boolean;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if user_uuid <> auth.uid() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select exists (
    select 1
    from public.user_subscriptions s
    where s.user_id = user_uuid
      and s.plan = 'premium_monthly'
      and (s.status = 'active' or s.status = 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  ) into is_premium_active;

  if is_premium_active then
    plan_id := 'premium_monthly';
    plan_name := 'premium_monthly';
    price_brl := 11.99;
    max_customers := null;
    max_transactions_per_month := null;
    is_premium := true;
  else
    plan_id := 'free';
    plan_name := 'free';
    price_brl := 0;
    max_customers := 2;
    max_transactions_per_month := 30;
    is_premium := false;
  end if;

  return next;
end;
$$;

-- 4) Limits enforcement helpers (backend source of truth)
create or replace function public.can_create_customer(user_uuid uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  p record;
  active_count integer;
begin
  select * into p from public.get_current_plan(user_uuid) limit 1;

  if p.max_customers is null then
    return true;
  end if;

  select count(*) into active_count
  from public.customers
  where user_id = user_uuid
    and is_active = true;

  if active_count < p.max_customers then
    return true;
  end if;

  raise exception 'Seu plano grátis permite até 2 clientes. Assine o Premium por R$11,99/mês para cadastrar clientes ilimitados.' using errcode = 'P0001';
end;
$$;

create or replace function public.can_create_transaction(user_uuid uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  p record;
  used_count integer;
  start_month timestamptz;
begin
  select * into p from public.get_current_plan(user_uuid) limit 1;

  if p.max_transactions_per_month is null then
    return true;
  end if;

  start_month := date_trunc('month', now());

  select count(*) into used_count
  from public.customer_transactions t
  where t.created_by = user_uuid
    and t.created_at >= start_month;

  if used_count < p.max_transactions_per_month then
    return true;
  end if;

  raise exception 'Você atingiu o limite de Fiado/Baixa do plano grátis. Assine o Premium por R$11,99/mês para usar sem limites.' using errcode = 'P0001';
end;
$$;

-- 5) RPCs that enforce limits and set business_id server-side
create or replace function public.create_customer_secure(
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_address text default null,
  p_notes text default null,
  p_credit_limit numeric default null,
  p_picture_storage_path text default null,
  p_picture_mime_type text default null
)
returns public.customers
language plpgsql security definer set search_path = public
as $$
declare
  user_uuid uuid;
  new_row public.customers;
begin
  user_uuid := auth.uid();
  if user_uuid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform public.can_create_customer(user_uuid);

  insert into public.customers (
    user_id, business_id, full_name, phone, email, address, notes, credit_limit, picture_storage_path, picture_mime_type, is_active
  )
  values (
    user_uuid,
    public.get_current_business_id(),
    p_full_name,
    regexp_replace(coalesce(p_phone, ''), '\\D', '', 'g'),
    nullif(p_email, ''),
    nullif(p_address, ''),
    p_notes,
    p_credit_limit,
    nullif(p_picture_storage_path, ''),
    nullif(p_picture_mime_type, ''),
    true
  )
  returning * into new_row;

  return new_row;
end;
$$;

create or replace function public.update_customer_enforced(
  p_customer_id uuid,
  p_full_name text default null,
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
language plpgsql security definer set search_path = public
as $$
declare
  updated_row public.customers;
begin
  update public.customers c
  set
    full_name = coalesce(nullif(p_full_name, ''), c.full_name),
    phone = case when p_phone is null then c.phone else regexp_replace(p_phone, '\\D', '', 'g') end,
    email = case when p_email is null then c.email else nullif(p_email, '') end,
    address = case when p_address is null then c.address else nullif(p_address, '') end,
    notes = case when p_notes is null then c.notes else p_notes end,
    credit_limit = case when p_credit_limit is null then c.credit_limit else p_credit_limit end,
    picture_storage_path = case
      when p_clear_photo then null
      when p_picture_storage_path is null then c.picture_storage_path
      else nullif(p_picture_storage_path, '')
    end,
    picture_mime_type = case
      when p_clear_photo then null
      when p_picture_mime_type is null then c.picture_mime_type
      else nullif(p_picture_mime_type, '')
    end
  where c.id = p_customer_id
    and c.business_id = public.get_current_business_id()
  returning * into updated_row;

  return updated_row;
end;
$$;

create or replace function public.create_customer_transaction_secure(
  p_customer_id uuid,
  p_type text,
  p_amount numeric,
  p_description text
)
returns public.customer_transactions
language plpgsql security definer set search_path = public
as $$
declare
  user_uuid uuid;
  cust_owner uuid;
  new_tx public.customer_transactions;
begin
  user_uuid := auth.uid();
  if user_uuid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select c.user_id into cust_owner
  from public.customers c
  where c.id = p_customer_id
  limit 1;

  if cust_owner is null then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  if cust_owner <> user_uuid then
    raise exception 'CUSTOMER_NOT_OWNED';
  end if;

  perform public.can_create_transaction(user_uuid);

  insert into public.customer_transactions (business_id, customer_id, type, amount, description, created_by)
  values (
    public.get_current_business_id(),
    p_customer_id,
    p_type,
    p_amount,
    coalesce(nullif(p_description, ''), case when p_type = 'payment' then 'Pagamento' else 'Fiado' end),
    user_uuid
  )
  returning * into new_tx;

  return new_tx;
end;
$$;

-- 6) Storage bucket for customer pictures (private)
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'customer-pictures') then
    insert into storage.buckets (id, name, public)
    values ('customer-pictures', 'customer-pictures', false);
  else
    update storage.buckets set public = false where id = 'customer-pictures';
  end if;
end $$;

-- Optional bucket constraints if supported by current Supabase version
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    execute 'update storage.buckets set file_size_limit = 5242880 where id = ''customer-pictures''';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
    execute 'update storage.buckets set allowed_mime_types = array[''image/jpeg'',''image/png'',''image/webp''] where id = ''customer-pictures''';
  end if;
end $$;

-- Storage policies: allow authenticated users to manage objects only inside their own folder
-- Path convention: {user_id}/{customer_id}/avatar.webp
drop policy if exists "Customer photos read own business" on storage.objects;
drop policy if exists "Customer photos write own business" on storage.objects;
drop policy if exists "Customer pictures read own folder" on storage.objects;
drop policy if exists "Customer pictures insert own folder" on storage.objects;
drop policy if exists "Customer pictures update own folder" on storage.objects;
drop policy if exists "Customer pictures delete own folder" on storage.objects;

create policy "Customer pictures read own folder"
  on storage.objects for select
  using (
    bucket_id = 'customer-pictures'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Customer pictures insert own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'customer-pictures'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Customer pictures update own folder"
  on storage.objects for update
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

create policy "Customer pictures delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'customer-pictures'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 7) Bootstrap: create business + owner profile for first-time users
create or replace function public.bootstrap_owner_profile(
  p_business_name text,
  p_owner_name text,
  p_phone text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  existing_business_id uuid;
  biz_id uuid;
begin
  select u.business_id into existing_business_id
  from public.profiles u
  where u.id = auth.uid()
  limit 1;

  if existing_business_id is not null then
    return existing_business_id;
  end if;

  -- Try to reuse an existing business by phone, else create new
  select b.id into biz_id
  from public.businesses b
  where b.phone = p_phone
  limit 1;

  if biz_id is null then
    insert into public.businesses (business_name, owner_name, phone)
    values (coalesce(nullif(p_business_name, ''), 'Meu Estabelecimento'), coalesce(nullif(p_owner_name, ''), 'Dono'), p_phone)
    returning id into biz_id;
  end if;

  insert into public.profiles (id, business_id, role, full_name, phone)
  values (auth.uid(), biz_id, 'owner', coalesce(nullif(p_owner_name, ''), 'Dono'), p_phone);

  return biz_id;
end;
$$;

-- 8) RLS + policies (requested)
-- profiles
alter table public.profiles enable row level security;
drop policy if exists "Select own profile" on public.profiles;
drop policy if exists "Insert own profile" on public.profiles;
drop policy if exists "Update own profile" on public.profiles;

create policy "Select own profile" on public.profiles for select using (id = auth.uid());
create policy "Insert own profile" on public.profiles for insert with check (id = auth.uid());
create policy "Update own profile" on public.profiles for update using (id = auth.uid());

-- customers
alter table public.customers enable row level security;
drop policy if exists "Select own customers" on public.customers;
drop policy if exists "Update own customers" on public.customers;
drop policy if exists "Delete own customers" on public.customers;
drop policy if exists "Deny direct insert" on public.customers;
drop policy if exists "Acesso total aos clientes da própria loja" on public.customers;

create policy "Select own customers" on public.customers for select using (user_id = auth.uid());
create policy "Update own customers" on public.customers for update using (user_id = auth.uid());
create policy "Delete own customers" on public.customers for delete using (user_id = auth.uid());
create policy "Deny direct insert" on public.customers for insert with check (false);

-- customer_transactions (renamed from transactions)
alter table public.customer_transactions enable row level security;
drop policy if exists "Select own transactions" on public.customer_transactions;
drop policy if exists "Delete own transactions" on public.customer_transactions;
drop policy if exists "Deny direct insert transactions" on public.customer_transactions;
drop policy if exists "Acesso a transações da própria loja" on public.customer_transactions;
drop policy if exists "Inserção de transações permitida aos colaboradores da loja" on public.customer_transactions;
drop policy if exists "Apenas o dono pode alterar/deletar histórico financeiro" on public.customer_transactions;
drop policy if exists "Apenas o dono pode excluir transações" on public.customer_transactions;

create policy "Select own transactions"
  on public.customer_transactions for select
  using (created_by = auth.uid());

create policy "Delete own transactions"
  on public.customer_transactions for delete
  using (created_by = auth.uid());

create policy "Deny direct insert transactions"
  on public.customer_transactions for insert
  with check (false);

-- Fix debt trigger to point to new table name
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transactions') then
    execute 'drop trigger if exists trg_update_debt_on_transaction on public.transactions';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customer_transactions') then
    execute 'drop trigger if exists trg_update_debt_on_transaction on public.customer_transactions';
    execute 'create trigger trg_update_debt_on_transaction after insert on public.customer_transactions for each row execute function public.update_customer_debt()';
  end if;
end $$;

-- 9) Balance view (source of truth for UI)
create or replace view public.customer_balance_view as
select
  c.id as customer_id,
  c.user_id,
  c.business_id,
  coalesce(sum(case when t.type = 'debt' then t.amount else 0 end), 0)::numeric(12,2) as total_fiado,
  coalesce(sum(case when t.type = 'payment' then t.amount else 0 end), 0)::numeric(12,2) as total_baixa,
  (coalesce(sum(case when t.type = 'debt' then t.amount else 0 end), 0) - coalesce(sum(case when t.type = 'payment' then t.amount else 0 end), 0))::numeric(12,2) as current_balance,
  case
    when (coalesce(sum(case when t.type = 'debt' then t.amount else 0 end), 0) - coalesce(sum(case when t.type = 'payment' then t.amount else 0 end), 0)) <= 0 then 'paid'
    when c.credit_limit is not null and (coalesce(sum(case when t.type = 'debt' then t.amount else 0 end), 0) - coalesce(sum(case when t.type = 'payment' then t.amount else 0 end), 0)) > c.credit_limit then 'over_limit'
    else 'open'
  end as balance_status
from public.customers c
left join public.customer_transactions t on t.customer_id = c.id
group by c.id;

alter view public.customer_balance_view owner to postgres;
