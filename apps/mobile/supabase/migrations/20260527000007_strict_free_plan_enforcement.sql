-- Strict free-plan enforcement at DB level.
-- Enforces limits even if client-side checks are bypassed.

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
    and coalesce(is_active, true) = true;

  if active_count < p.max_customers then
    return true;
  end if;

  raise exception 'FREE_PLAN_CUSTOMER_LIMIT_REACHED: Upgrade to Premium (124/month) for unlimited customers.' using errcode = 'P0001';
end;
$$;

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
    and coalesce(transaction_date, created_at, now()) >= start_month;

  if used_count < p.max_transactions_per_month then
    return true;
  end if;

  raise exception 'FREE_PLAN_TRANSACTION_LIMIT_REACHED: Upgrade to Premium (124/month) for unlimited transactions.' using errcode = 'P0001';
end;
$$;

create or replace function public.enforce_free_plan_customer_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  new.user_id := coalesce(new.user_id, auth.uid());
  if new.user_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if coalesce(new.is_active, true) = true then
    perform public.can_create_customer();
  end if;

  return new;
end;
$$;

create or replace function public.enforce_free_plan_transaction_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_owner uuid;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  new.user_id := coalesce(new.user_id, auth.uid());
  if new.user_id <> auth.uid() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select c.user_id into customer_owner
  from public.customers c
  where c.id = new.customer_id
  limit 1;

  if customer_owner is null then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if customer_owner <> auth.uid() then
    raise exception 'CUSTOMER_NOT_OWNED';
  end if;

  perform public.can_create_transaction();

  return new;
end;
$$;

drop trigger if exists trg_enforce_free_plan_customer_limit_insert on public.customers;
create trigger trg_enforce_free_plan_customer_limit_insert
before insert on public.customers
for each row execute function public.enforce_free_plan_customer_limit();

drop trigger if exists trg_enforce_free_plan_customer_limit_reactivate on public.customers;
create trigger trg_enforce_free_plan_customer_limit_reactivate
before update on public.customers
for each row
when (coalesce(old.is_active, true) = false and coalesce(new.is_active, true) = true)
execute function public.enforce_free_plan_customer_limit();

drop trigger if exists trg_enforce_free_plan_transaction_limit_insert on public.customer_transactions;
create trigger trg_enforce_free_plan_transaction_limit_insert
before insert on public.customer_transactions
for each row execute function public.enforce_free_plan_transaction_limit();
