-- 20260525000004_drop_get_current_plan_uuid_overload.sql
-- Remove the uuid-argument overload of get_current_plan() to eliminate PostgREST
-- ambiguity. The canonical no-arg version (from 20260524) uses auth.uid() internally
-- and is the only version the app calls (store/index.ts:306).
-- The uuid-arg variant was an intermediate design in 20260521 and was superseded
-- by the no-arg version. Having both in scope risks silent resolution failures.

drop function if exists public.get_current_plan(uuid);

-- Ensure only the no-arg version remains exposed to authenticated role
-- (20260524 already grants this, but we re-assert for clarity)
grant execute on function public.get_current_plan() to authenticated;
