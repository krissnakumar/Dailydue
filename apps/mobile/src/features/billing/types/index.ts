export type SubscriptionPlanId = 'free' | 'premium_monthly';

export interface BillingSubscription {
  plan_id: SubscriptionPlanId;
  is_premium: boolean;
  max_customers: number | null;
  max_transactions_per_month: number | null;
  source: 'play' | 'cloud' | 'simulated';
  is_simulated: boolean;
}

export interface BillingState {
  subscription: BillingSubscription;
  loading: boolean;
  error: string | null;
}
