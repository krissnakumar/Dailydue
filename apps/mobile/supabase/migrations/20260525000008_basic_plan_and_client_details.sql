-- ============================================================================
-- FAIDO MOBILE - CLIENT DETAILS UPGRADE
-- ============================================================================

-- 1. Add cep, document_type, and document_value columns to public.customers
alter table public.customers add column if not exists cep text;
alter table public.customers add column if not exists document_type text;
alter table public.customers add column if not exists document_value text;

-- 2. Update get_current_plan to include status/source fields
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
  ),
  requested as (
    select coalesce((select resolved_plan_id from active_sub), 'free') as requested_plan_id
  ),
  plan as (
    select sp.*
    from public.subscription_plans sp
    where sp.id = (select requested_plan_id from requested)
    limit 1
  ),
  selected_plan as (
    select * from plan
    union all
    select sp.*
    from public.subscription_plans sp
    where sp.id = 'free'
      and not exists (select 1 from plan)
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
  from selected_plan sp
  limit 1;
$$;

-- 3. Recreate can_create_customer with custom dynamic error message
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

  raise exception 'Você atingiu o limite de % clientes para o plano %. Atualize seu plano para continuar cadastrando.', p.max_customers, p.plan_name using errcode = 'P0001';
end;
$$;

-- 4. Recreate can_create_transaction with custom dynamic error message
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

  raise exception 'Você atingiu o limite de % lançamentos para o plano %. Atualize seu plano para continuar registrando.', p.max_transactions_per_month, p.plan_name using errcode = 'P0001';
end;
$$;

-- 5. Recreate create_customer_secure to accept and insert cep, document_type, document_value
drop function if exists public.create_customer_secure(text, text, text, text, text, numeric, text, text);
drop function if exists public.create_customer_secure(text, text, text, text, text, numeric, text, text, text, text, text);

create or replace function public.create_customer_secure(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null,
  p_credit_limit numeric default 0,
  p_picture_storage_path text default null,
  p_picture_mime_type text default null,
  p_cep text default null,
  p_document_type text default null,
  p_document_value text default null
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
    is_active,
    cep,
    document_type,
    document_value
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
    true,
    nullif(p_cep, ''),
    nullif(p_document_type, ''),
    nullif(p_document_value, '')
  )
  returning * into new_row;

  return new_row;
end;
$$;

grant execute on function public.create_customer_secure(text, text, text, text, text, numeric, text, text, text, text, text) to authenticated;

-- 6. Recreate update_customer_enforced to accept and update cep, document_type, document_value
drop function if exists public.update_customer_enforced(uuid, text, text, text, text, text, numeric, text, text, boolean);
drop function if exists public.update_customer_enforced(uuid, text, text, text, text, text, numeric, text, text, boolean, text, text, text);

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
  p_clear_photo boolean default false,
  p_cep text default null,
  p_document_type text default null,
  p_document_value text default null
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
    cep = case when p_cep is null then c.cep else nullif(p_cep, '') end,
    document_type = case when p_document_type is null then c.document_type else nullif(p_document_type, '') end,
    document_value = case when p_document_value is null then c.document_value else nullif(p_document_value, '') end,
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

grant execute on function public.update_customer_enforced(uuid, text, text, text, text, text, numeric, text, text, boolean, text, text, text) to authenticated;
