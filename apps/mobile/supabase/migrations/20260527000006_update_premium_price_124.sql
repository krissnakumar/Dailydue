-- Update Premium Monthly price to 124.00

update public.subscription_plans
set
  name = coalesce(name, 'Premium Monthly'),
  price_brl = 124.00,
  billing_interval = coalesce(billing_interval, 'monthly'),
  is_active = true,
  updated_at = now()
where id = 'premium_monthly';

insert into public.subscription_plans (id, name, price_brl, billing_interval, max_customers, max_transactions_per_month, is_active)
select 'premium_monthly', 'Premium Monthly', 124.00, 'monthly', null, null, true
where not exists (
  select 1 from public.subscription_plans where id = 'premium_monthly'
);
