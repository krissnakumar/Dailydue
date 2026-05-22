/**
 * Entidades Principais e Tipos do Supabase - Controle de Fiado
 */

export type SubscriptionPlanName = 'free' | 'premium_monthly';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface Business {
  id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  pix_key?: string;
  created_at: string;
}

export type UserRole = 'owner' | 'cashier' | 'employee';

export interface UserProfile {
  id: string; // Referência direta para auth.users.id do Supabase
  business_id: string;
  role: UserRole;
  full_name: string;
  phone: string;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  user_id?: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string;
  credit_limit?: number | null;
  picture_storage_path?: string | null;
  picture_mime_type?: string | null;
  total_debt?: number;
  is_active?: boolean;
  created_at: string;
}

export interface CustomerBalanceView {
  customer_id: string;
  user_id: string | null;
  business_id: string;
  total_fiado: number;
  total_baixa: number;
  current_balance: number;
  balance_status: 'paid' | 'open' | 'over_limit';
}

export type TransactionType = 'debt' | 'payment';

export interface Transaction {
  id: string;
  business_id?: string;
  customer_id: string;
  type?: TransactionType;
  transaction_type?: TransactionType;
  amount: number;
  description: string;
  created_by?: string;
  user_id?: string;
  transaction_date?: string;
  created_at: string;
}

export type WhatsappStatus = 'sent' | 'delivered' | 'failed';

export interface WhatsappLog {
  id: string;
  customer_id: string;
  phone: string;
  message: string;
  status: WhatsappStatus;
  created_at: string;
}
