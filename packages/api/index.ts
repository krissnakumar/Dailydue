import { createClient } from '@supabase/supabase-js';
import * as ExpoCrypto from 'expo-crypto';
import type { Customer, CustomerBalanceView, Transaction, Business, SubscriptionPlanName } from '@controle-fiado/types';

function installReactNativeWebCryptoPolyfill() {
  const target = globalThis as any;
  const currentCrypto = target.crypto || {};

  if (!target.crypto) {
    target.crypto = currentCrypto;
  }

  if (typeof currentCrypto.getRandomValues !== 'function' && typeof ExpoCrypto.getRandomBytes === 'function') {
    currentCrypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      const randomBytes = ExpoCrypto.getRandomBytes(array.byteLength);
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(randomBytes);
      return array;
    };
  }

  if (!currentCrypto.subtle) {
    currentCrypto.subtle = {};
  }

  if (typeof currentCrypto.subtle.digest !== 'function' && typeof ExpoCrypto.digest === 'function') {
    currentCrypto.subtle.digest = (algorithm: string | { name: string }, data: BufferSource) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      return ExpoCrypto.digest(name as any, data);
    };
  }
}

installReactNativeWebCryptoPolyfill();

// Em React Native (Expo), variáveis de ambiente são substituídas estaticamente.
// Portanto, é obrigatório acessar process.env.EXPO_PUBLIC_* diretamente.
const supabaseUrl = 
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  // @ts-ignore
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  '';

const supabaseAnonKey = 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  // @ts-ignore
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  '';

export const supabaseEnvOk = Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('localhost'));

let supabaseAuthStorage: any = undefined;
try {
  // React Native doesn't have localStorage; use AsyncStorage when available.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  (typeof navigator !== 'undefined' && (navigator as any)?.product === 'ReactNative') &&
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (supabaseAuthStorage = require('@react-native-async-storage/async-storage')?.default);
} catch {
  // ignore
}

export interface SupabaseUserMetadata {
  full_name?: string;
  name?: string;
  picture?: string;
  avatar_url?: string;
}

export function extractUserMetadata(metadata: any): { full_name?: string; picture?: string } {
  if (!metadata) return { full_name: undefined, picture: undefined };
  const m = metadata as SupabaseUserMetadata;
  return {
    full_name: m.full_name || m.name || undefined,
    picture: m.picture || m.avatar_url || undefined,
  };
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url-for-missing-env.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(supabaseAuthStorage ? { flowType: 'pkce' as const } : {}),
      ...(supabaseAuthStorage ? { storage: supabaseAuthStorage } : {}),
    },
  }
);

// ============================================================================
// SERVIÇOS DE AUTENTICAÇÃO (OTP Simplificado por Telefone)
// ============================================================================
export async function signInWithPhone(phone: string) {
  return await supabase.auth.signInWithOtp({
    phone,
  });
}

export async function verifyPhoneOtp(phone: string, token: string) {
  return await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
}

export async function signInWithEmail(email: string, emailRedirectTo?: string) {
  return await supabase.auth.signInWithOtp({
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function bootstrapOwnerProfile(params: {
  business_name: string;
  owner_name: string;
  phone: string;
}) {
  const { data, error } = await supabase.rpc('bootstrap_owner_profile', {
    p_business_name: params.business_name,
    p_owner_name: params.owner_name,
    p_phone: params.phone,
  });
  if (error) throw error;
  return data as string; // business_id
}

// ============================================================================
// SERVIÇOS DE DADOS COMPARTILHADOS (Tipados com @controle-fiado/types)
// ============================================================================
export async function getCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Customer[];
}

export async function getCustomerBalances() {
  const { data, error } = await supabase
    .from('customer_balance_view')
    .select('*');
  if (error) throw error;
  return data as CustomerBalanceView[];
}

export async function getCurrentPlan() {
  const { data, error } = await supabase.rpc('get_current_plan');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row?.plan_name || 'free') as SubscriptionPlanName;
}

export async function createCustomerEnforced(params: {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  picture_storage_path?: string | null;
  picture_mime_type?: string | null;
}) {
  const { data, error } = await supabase.rpc('create_customer_secure', {
    p_name: params.name,
    p_phone: params.phone,
    p_email: params.email ?? null,
    p_address: params.address ?? null,
    p_notes: params.notes ?? null,
    p_credit_limit: params.credit_limit ?? null,
    p_picture_storage_path: params.picture_storage_path ?? null,
    p_picture_mime_type: params.picture_mime_type ?? null,
  });
  if (error) throw error;
  return data as Customer;
}

export async function updateCustomer(params: {
  customer_id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  credit_limit?: number | null;
  picture_storage_path?: string | null;
  picture_mime_type?: string | null;
  clear_photo?: boolean;
}) {
  const payload: Record<string, any> = {};
  if (params.name !== undefined) payload.name = params.name;
  if (params.phone !== undefined) payload.phone = params.phone;
  if (params.email !== undefined) payload.email = params.email;
  if (params.address !== undefined) payload.address = params.address;
  if (params.notes !== undefined) payload.notes = params.notes;
  if (params.credit_limit !== undefined) payload.credit_limit = params.credit_limit;

  if (params.clear_photo) {
    payload.picture_storage_path = null;
    payload.picture_mime_type = null;
  } else {
    if (params.picture_storage_path !== undefined) payload.picture_storage_path = params.picture_storage_path;
    if (params.picture_mime_type !== undefined) payload.picture_mime_type = params.picture_mime_type;
  }

  const { data, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', params.customer_id)
    .select()
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function createTransactionEnforced(params: {
  customer_id: string;
  type: 'debt' | 'payment';
  amount: number;
  description: string;
}) {
  const { data, error } = await supabase.rpc('create_customer_transaction_secure', {
    p_customer_id: params.customer_id,
    p_transaction_type: params.type,
    p_amount: params.amount,
    p_description: params.description,
  });
  if (error) throw error;
  return data as Transaction;
}

export async function getTransactionsByCustomer(customer_id: string) {
  const { data, error } = await supabase
    .from('customer_transactions')
    .select('*')
    .eq('customer_id', customer_id)
    .order('transaction_date', { ascending: false });
  if (error) throw error;
  return data as Transaction[];
}

export type RecentTransactionRow = Transaction & {
  customers?: { name: string | null } | null;
};

export async function getRecentTransactions(limit = 20) {
  const { data, error } = await supabase
    .from('customer_transactions')
    .select('*, customers(name)')
    .order('transaction_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as RecentTransactionRow[];
}

export async function deleteCustomer(customer_id: string) {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customer_id);
  if (error) throw error;
}

export async function deleteTransaction(transaction_id: string) {
  const { error } = await supabase
    .from('customer_transactions')
    .delete()
    .eq('id', transaction_id);
  if (error) throw error;
}
