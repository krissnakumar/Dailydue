-- 20260525000006_delete_secure_rpcs.sql
--
-- Replace direct-table deletes with server-enforced RPC functions.
--
-- Previously deleteCustomer and deleteTransaction used direct .delete()
-- calls which relied entirely on RLS policies. If RLS changes (e.g. to
-- implement soft-deletes or audit logs), those calls would silently fail
-- or skip the new logic entirely. RPCs with SECURITY DEFINER execute as
-- the function owner (postgres), meaning the delete logic is always
-- enforced server-side regardless of the calling role or RLS state.
--
-- Both RPCs:
--   1. Verify the caller is authenticated.
--   2. Verify the caller owns the row (user_id = auth.uid()).
--   3. Perform the delete (hard delete for now; easy to swap to soft-delete).
--   4. Return true on success, raise an exception on ownership mismatch.

-- ============================================================================
-- 1. delete_customer_secure(p_customer_id uuid)
-- ============================================================================

drop function if exists public.delete_customer_secure(uuid);
create or replace function public.delete_customer_secure(p_customer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_owner   uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select user_id into v_owner
  from public.customers
  where id = p_customer_id;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  if v_owner <> v_user_id then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Cascade: customer_transactions rows are deleted by FK ON DELETE CASCADE.
  delete from public.customers where id = p_customer_id;

  return true;
end;
$$;

grant execute on function public.delete_customer_secure(uuid) to authenticated;

-- ============================================================================
-- 2. delete_transaction_secure(p_transaction_id uuid)
-- ============================================================================

drop function if exists public.delete_transaction_secure(uuid);
create or replace function public.delete_transaction_secure(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_owner   uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Support both user_id and created_by columns (schema evolution).
  select coalesce(user_id, created_by) into v_owner
  from public.customer_transactions
  where id = p_transaction_id;

  if not found then
    raise exception 'TRANSACTION_NOT_FOUND';
  end if;

  if v_owner <> v_user_id then
    raise exception 'NOT_AUTHORIZED';
  end if;

  delete from public.customer_transactions where id = p_transaction_id;
  -- The update_customer_debt trigger fires on DELETE automatically
  -- and recomputes total_debt for the affected customer.

  return true;
end;
$$;

grant execute on function public.delete_transaction_secure(uuid) to authenticated;
