-- ============================================================================
-- Security Hardening: Subscription & Business Audit Triggers
-- ============================================================================

drop trigger if exists trg_audit_user_subscriptions on public.user_subscriptions;
create trigger trg_audit_user_subscriptions
  after insert or update or delete on public.user_subscriptions
  for each row execute function public.process_audit_trigger();

drop trigger if exists trg_audit_businesses on public.businesses;
create trigger trg_audit_businesses
  after insert or update or delete on public.businesses
  for each row execute function public.process_audit_trigger();
