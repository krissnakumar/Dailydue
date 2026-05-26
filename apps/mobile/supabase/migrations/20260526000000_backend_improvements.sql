-- Migration: Supabase Backend Improvements
-- Date: 2026-05-26
-- Description: Adds balance calculation functions, audit logging, computed debt totals, materialized views, triggers, and improved RLS isolation policies.

-- ============================================================================
-- 1. Balance & Debt Calculation Functions
-- ============================================================================

-- Calculated debt total for an individual customer
create or replace function public.get_customer_debt_total(p_customer_id uuid)
returns numeric(12, 2)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_balance numeric(12, 2);
begin
  select coalesce(sum(case when transaction_type = 'debt' then amount else -amount end), 0)
  into v_balance
  from public.customer_transactions
  where customer_id = p_customer_id;
  
  return coalesce(v_balance, 0.00);
end;
$$;

-- Global merchant receivable balance calculation across all customers
create or replace function public.get_merchant_balance(p_merchant_id uuid)
returns numeric(12, 2)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_merchant_total numeric(12, 2);
begin
  select coalesce(sum(case when transaction_type = 'debt' then amount else -amount end), 0)
  into v_merchant_total
  from public.customer_transactions
  where user_id = p_merchant_id;
  
  return coalesce(v_merchant_total, 0.00);
end;
$$;

-- ============================================================================
-- 2. Audit Logging Infrastructure
-- ============================================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- Index for speedy merchant-level log lookups
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select_own" on public.audit_logs;
create policy "audit_logs_select_own" on public.audit_logs for select using (user_id = auth.uid());

-- Trigger function for automated change capture
create or replace function public.process_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    -- Fallback to row user_id if triggered from backend/reconciliation
    if tg_op = 'DELETE' then
      v_user_id := old.user_id;
    else
      v_user_id := new.user_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    values (v_user_id, 'INSERT', tg_table_name, new.id, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    values (v_user_id, 'UPDATE', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
    values (v_user_id, 'DELETE', tg_table_name, old.id, to_jsonb(old), null);
  end if;

  return null;
end;
$$;

-- Connect audit triggers
drop trigger if exists trg_audit_customers on public.customers;
create trigger trg_audit_customers
  after insert or update or delete on public.customers
  for each row execute function public.process_audit_trigger();

drop trigger if exists trg_audit_customer_transactions on public.customer_transactions;
create trigger trg_audit_customer_transactions
  after insert or update or delete on public.customer_transactions
  for each row execute function public.process_audit_trigger();

-- ============================================================================
-- 3. Materialized View for Merchant Analytics
-- ============================================================================

drop materialized view if exists public.merchant_debt_summaries cascade;

create materialized view public.merchant_debt_summaries as
select
  user_id as merchant_id,
  count(distinct id) as total_customers,
  coalesce(sum(credit_limit), 0)::numeric(12,2) as total_credit_limit,
  count(distinct case when is_active = true then id end) as active_customers,
  now() as last_refreshed_at
from public.customers
group by user_id;

-- Index to query materialized data instantly
create unique index if not exists idx_merchant_debt_summaries_merchant on public.merchant_debt_summaries(merchant_id);

-- Function to refresh the analytics
create or replace function public.refresh_merchant_debt_summaries()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.merchant_debt_summaries;
end;
$$;

-- ============================================================================
-- 4. Improved Strict RLS Policies for Merchant Isolation
-- ============================================================================

-- Ensure customers table strictly filters by authenticating owner ID
alter table public.customers enable row level security;
drop policy if exists "customers_select_own" on public.customers;
drop policy if exists "customers_update_own" on public.customers;
drop policy if exists "customers_delete_own" on public.customers;

create policy "customers_select_own" on public.customers for select using (user_id = auth.uid());
create policy "customers_update_own" on public.customers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customers_delete_own" on public.customers for delete using (user_id = auth.uid());

-- Ensure customer_transactions strictly isolates entries
alter table public.customer_transactions enable row level security;
drop policy if exists "customer_transactions_select_own" on public.customer_transactions;
drop policy if exists "customer_transactions_delete_own" on public.customer_transactions;

create policy "customer_transactions_select_own" on public.customer_transactions for select using (user_id = auth.uid());
create policy "customer_transactions_delete_own" on public.customer_transactions for delete using (user_id = auth.uid());

-- Ensure profiles are secure
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
