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

  if (typeof currentCrypto.randomUUID !== 'function' && typeof ExpoCrypto.randomUUID === 'function') {
    currentCrypto.randomUUID = (): string => {
      return ExpoCrypto.randomUUID();
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

function mimeFromUri(uri: string) {
  const clean = uri.split('?')[0]?.toLowerCase() || '';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function uploadOwnerProfilePicture(uri: string, mimeType?: string | null) {
  const session = (await supabase.auth.getSession()).data.session;
  const userId = session?.user?.id;
  if (!userId) throw new Error('NOT_AUTHENTICATED');

  const mime = mimeType || mimeFromUri(uri);
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('owner-pictures')
    .upload(path, blob as any, { contentType: mime, upsert: true } as any);
  if (error) throw error;

  const { data } = await supabase.storage.from('owner-pictures').createSignedUrl(path, 60 * 60 * 24 * 7);
  return { path, mime_type: mime, signed_url: data?.signedUrl || uri };
}

export async function updateOwnerProfile(params: {
  full_name?: string | null;
  business_name?: string | null;
  phone?: string | null;
  pix_key?: string | null;
  avatar_storage_path?: string | null;
  avatar_mime_type?: string | null;
  picture_url?: string | null;
  clear_avatar?: boolean;
}) {
  const { data, error } = await supabase.rpc('update_owner_profile', {
    p_full_name: params.full_name ?? null,
    p_business_name: params.business_name ?? null,
    p_phone: params.phone ?? null,
    p_pix_key: params.pix_key ?? null,
    p_avatar_storage_path: params.avatar_storage_path ?? null,
    p_avatar_mime_type: params.avatar_mime_type ?? null,
    p_clear_avatar: Boolean(params.clear_avatar),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;

  await supabase.auth.updateUser({
    data: {
      full_name: params.full_name || undefined,
      picture: params.picture_url || undefined,
      avatar_url: params.picture_url || undefined,
      avatar_storage_path: row?.avatar_storage_path || undefined,
      avatar_mime_type: row?.avatar_mime_type || undefined,
    },
  });

  return row as {
    profile_id: string;
    business_id: string;
    full_name: string | null;
    business_name: string | null;
    phone: string | null;
    pix_key: string | null;
    avatar_storage_path: string | null;
    avatar_mime_type: string | null;
  };
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

export async function getCustomersWithTransactions() {
  const { data, error } = await supabase
    .from('customers')
    .select('*, customer_transactions(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Sort nested transactions by transaction_date descending
  if (data) {
    data.forEach((c: any) => {
      if (c.customer_transactions) {
        c.customer_transactions.sort((a: any, b: any) => {
          return new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
        });
      }
    });
  }
  return data;
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
  try {
    const { data, error } = await supabase.rpc('update_customer_enforced', {
      p_customer_id: params.customer_id,
      p_name: params.name ?? null,
      p_phone: params.phone ?? null,
      p_email: params.email ?? null,
      p_address: params.address ?? null,
      p_notes: params.notes ?? null,
      p_credit_limit: params.credit_limit ?? null,
      p_picture_storage_path: params.picture_storage_path ?? null,
      p_picture_mime_type: params.picture_mime_type ?? null,
      p_clear_photo: Boolean(params.clear_photo),
    });
    if (!error) return data as Customer;
  } catch {
    // Older deployments may not have the RPC yet; fall back to RLS-protected update.
  }

  const payload: Record<string, any> = {};
  if (params.name !== undefined) payload.name = params.name;
  if (params.name !== undefined) payload.full_name = params.name;
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

export async function verifyGooglePlaySubscription(params: {
  packageName: string;
  productId: string;
  purchaseToken: string;
}) {
  const { data, error } = await supabase.functions.invoke('verify-google-play-purchase', {
    body: {
      packageName: params.packageName,
      productId: params.productId,
      purchaseToken: params.purchaseToken,
    },
  });

  if (error) throw error;
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as {
    success: boolean;
    plan_id: 'premium_monthly';
    product_id: string;
    status: string;
    current_period_end: string | null;
    is_premium: boolean;
  };
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
  // Uses delete_customer_secure RPC instead of a direct table delete.
  // The RPC enforces ownership (user_id = auth.uid()) server-side with
  // SECURITY DEFINER — immune to future RLS policy changes.
  const { error } = await supabase.rpc('delete_customer_secure', {
    p_customer_id: customer_id,
  });
  if (error) throw error;
}

export async function deleteTransaction(transaction_id: string) {
  // Uses delete_transaction_secure RPC instead of a direct table delete.
  // The RPC enforces ownership server-side and fires the debt-recompute
  // trigger automatically on delete.
  const { error } = await supabase.rpc('delete_transaction_secure', {
    p_transaction_id: transaction_id,
  });
  if (error) throw error;
}
