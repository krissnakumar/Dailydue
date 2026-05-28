export interface HistoryItem {
  id: string;
  description: string;
  amount: number;
  created_at: string;
  type: 'debt' | 'payment' | 'system';
  created_by?: string;
  due_date?: string;
}

export interface CustomerClient {
  id: string;
  business_id: string;
  name: string;
  full_name: string;
  phone: string;
  whatsapp?: string;
  total_debt: number;
  created_at: string;
  history: HistoryItem[];
  postalCode?: string;
  cep?: string;
  address?: string;
  idType?: 'aadhaar' | 'pan';
  documentType?: 'aadhaar' | 'pan';
  idValue?: string;
  documentValue?: string;
  picture?: string;
  picture_storage_path?: string | null;
  picture_mime_type?: string | null;
  picture_updated_at?: string;
  notes?: string | null;
}

export interface QuickItemClient {
  name: string;
  price: number;
  count: number;
  lastUsed: string;
}

export interface PendingQueueItem {
  id: string;
  type: 'debt' | 'payment' | 'create_customer' | 'update_customer' | 'delete_customer' | 'delete_transaction';
  payload: any; // We can strictly define this inside sync or features if necessary
  added_at: string;
}

export interface UserSubscriptionState {
  plan_id: 'free' | 'premium_monthly';
  plan_name: string;
  price_brl: number;
  max_customers: number | null;
  max_transactions_per_month: number | null;
  is_premium: boolean;
  status: 'active' | 'trialing' | 'canceled' | 'none';
  current_period_end: string | null;
  is_simulated: boolean;
  source: 'cloud' | 'play' | 'simulated';
}
