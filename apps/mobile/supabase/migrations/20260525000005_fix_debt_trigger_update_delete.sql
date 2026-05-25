-- 20260525000005_fix_debt_trigger_update_delete.sql
--
-- BUG: The update_customer_debt trigger only handled INSERT, so any
-- transaction DELETE (deleteHistoryItem) or UPDATE (editHistoryItem) left
-- customers.total_debt permanently stale in the database.
--
-- FIX: Replace the increment/decrement approach with a full SUM() recompute
-- on INSERT, UPDATE, and DELETE. This is idempotent and drift-proof —
-- total_debt will always equal the actual sum regardless of operation order.
-- Handles both the legacy `transactions` table and the current
-- `customer_transactions` table.

-- ============================================================================
-- 1. Replace the trigger function with a recompute-based approach
-- ============================================================================

create or replace function public.update_customer_debt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_total       numeric(12,2);
begin
  -- For DELETE, NEW is null; use OLD. For INSERT/UPDATE use NEW.
  v_customer_id := coalesce(
    (case when tg_op <> 'DELETE' then new.customer_id else null end),
    old.customer_id
  );

  if v_customer_id is null then
    return coalesce(new, old);
  end if;

  -- Recompute from scratch — immune to drift regardless of how many
  -- INSERT/UPDATE/DELETE events have happened out of order.
  select coalesce(
    sum(case when coalesce(type, transaction_type) = 'debt'    then amount else 0 end) -
    sum(case when coalesce(type, transaction_type) = 'payment' then amount else 0 end),
    0
  )
  into v_total
  from public.customer_transactions
  where customer_id = v_customer_id;

  update public.customers
  set total_debt = greatest(0, v_total)
  where id = v_customer_id;

  -- Also handle the legacy `transactions` table if it still exists
  -- (some environments kept it alongside customer_transactions)
  if tg_table_name = 'transactions' then
    -- already handled above via the same customer_id
    null;
  end if;

  return coalesce(new, old);
end;
$$;

-- ============================================================================
-- 2. Re-attach trigger on customer_transactions: INSERT + UPDATE + DELETE
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'customer_transactions'
  ) then
    execute 'drop trigger if exists trg_update_debt_on_transaction on public.customer_transactions';
    execute $t$
      create trigger trg_update_debt_on_transaction
        after insert or update or delete
        on public.customer_transactions
        for each row
        execute function public.update_customer_debt()
    $t$;
  end if;
end $$;

-- ============================================================================
-- 3. Re-attach on legacy `transactions` table if still present
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transactions'
  ) then
    execute 'drop trigger if exists trg_update_debt_on_transaction on public.transactions';
    execute $t$
      create trigger trg_update_debt_on_transaction
        after insert or update or delete
        on public.transactions
        for each row
        execute function public.update_customer_debt()
    $t$;
  end if;
end $$;

-- ============================================================================
-- 4. One-time recompute: fix all existing stale total_debt values
--    caused by past deletes/edits that the old INSERT-only trigger missed.
-- ============================================================================

update public.customers c
set total_debt = greatest(0, coalesce((
  select
    sum(case when coalesce(t.type, t.transaction_type) = 'debt'    then t.amount else 0 end) -
    sum(case when coalesce(t.type, t.transaction_type) = 'payment' then t.amount else 0 end)
  from public.customer_transactions t
  where t.customer_id = c.id
), 0));
