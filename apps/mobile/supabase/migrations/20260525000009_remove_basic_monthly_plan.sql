-- ============================================================================
-- FAIDO MOBILE - REMOVE BASIC MONTHLY PLAN
-- ============================================================================

-- If any data already references `basic_monthly`, migrate it to `premium_monthly`
-- to keep `get_current_plan()` always returning a valid plan row.
update public.user_subscriptions
set
  plan_id = 'premium_monthly',
  plan = 'premium_monthly',
  updated_at = now()
where plan_id = 'basic_monthly'
   or plan = 'basic_monthly';

-- Deactivate the plan if it exists (safer than delete with FK references)
update public.subscription_plans
set
  is_active = false,
  updated_at = now()
where id = 'basic_monthly';

