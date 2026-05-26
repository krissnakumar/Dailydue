import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  supabase,
  bootstrapOwnerProfile,
  createCustomerEnforced,
  createTransactionEnforced,
  updateCustomer,
  deleteCustomer as apiDeleteCustomer,
  deleteTransaction as apiDeleteTransaction,
  getCustomersWithTransactions,
} from '@controle-fiado/api';
import * as Haptics from 'expo-haptics';

const SYNC_RETRY_BASE_MS = 15_000;
const SYNC_RETRY_MAX_MS = 5 * 60_000;
let syncRetryTimer: ReturnType<typeof setTimeout> | null = null;
let syncRetryDelayMs = SYNC_RETRY_BASE_MS;

function scheduleSyncRetry(reason: string, retryFn: () => void) {
  try {
    if (syncRetryTimer) clearTimeout(syncRetryTimer);
  } catch {}

  const delay = Math.min(syncRetryDelayMs, SYNC_RETRY_MAX_MS);
  console.log(`[Sync] Agendando retentativa em ${Math.round(delay / 1000)}s. reason=${reason}`);
  syncRetryTimer = setTimeout(() => {
    try {
      retryFn();
    } catch {}
  }, delay);

  syncRetryDelayMs = Math.min(syncRetryDelayMs * 2, SYNC_RETRY_MAX_MS);
}

function resetSyncRetryBackoff() {
  syncRetryDelayMs = SYNC_RETRY_BASE_MS;
  if (syncRetryTimer) {
    try {
      clearTimeout(syncRetryTimer);
    } catch {}
    syncRetryTimer = null;
  }
}

/**
 * Generates a collision-resistant local ID by combining a millisecond
 * timestamp with a random 5-character base-36 suffix.
 * Replaces plain Date.now() IDs which collide on rapid taps or batch ops.
 * Format: "<prefix>_<ms>_<rand>" e.g. "hist_1716643200000_x7k2q"
 */
function localId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch (e) {
    // fallback if crypto is not yet initialized or in environments without it
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
export interface HistoryItem {
  id: string;
  description: string;
  amount: number;
  created_at: string;
  type: 'debt' | 'payment' | 'system';
  created_by?: string;
}

export interface CustomerClient {
  id: string;
  business_id: string;
  /** Canonical name field — matches the `name` column added in 20260524. */
  name: string;
  /** Kept in sync with `name` by DB trigger — use `name` as primary reference. */
  full_name: string;
  phone: string;
  whatsapp?: string;
  total_debt: number;
  created_at: string;
  history: HistoryItem[];
  cep?: string;
  address?: string;
  documentType?: 'cpf' | 'cnpj';
  documentValue?: string;
  picture?: string;
  picture_storage_path?: string | null;
  picture_mime_type?: string | null;
  picture_updated_at?: string;
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
  payload: any;
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

export interface FiadoMobileState {
  // Auth State
  user: { email?: string; id?: string; full_name?: string; picture?: string; avatar_url?: string } | null;
  authChecked: boolean;
  businessConfig: {
    businessName: string;
    pixKey: string;
    phone: string;
  };
  setUser: (user: FiadoMobileState['user']) => void;
  setAuthChecked: (checked: boolean) => void;
  updateBusinessConfig: (config: Partial<FiadoMobileState['businessConfig']>) => void;

  // Subscription State
  subscription: UserSubscriptionState;
  fetchSubscription: () => Promise<void>;
  toggleSubscriptionSimulation: (enabled: boolean, planId?: 'free' | 'premium_monthly') => void;
  simulateSubscriptionUpgrade: (method: 'pix' | 'card') => void;
  simulateSubscriptionDowngrade: () => void;
  setPlayPremiumActive: (active: boolean) => void;
  getActiveCustomersCount: () => number;
  getCurrentMonthTransactionsCount: () => number;

  customers: CustomerClient[];
  quickItems: QuickItemClient[];
  syncQueue: PendingQueueItem[];
  failedSyncItems: Array<PendingQueueItem & { failed_reason: string; failed_at: string }>;
  customerIdMap: Record<string, string>;
  isSyncing: boolean;
  hasBootstrappedProfile: boolean;
  /** Real business UUID resolved from the server. Null until first successful sync. */
  currentBusinessId: string | null;

  // Novo Fiado Popup State
  novoFiadoState: { isOpen: boolean; customerId?: string };
  openNovoFiado: (customerId?: string) => void;
  closeNovoFiado: () => void;

  // Novo Cliente Popup State
  novoClienteState: { isOpen: boolean };
  openNovoCliente: () => void;
  closeNovoCliente: () => void;

  // Actions
  refreshCustomerPictureUrls: () => Promise<void>;
  addCustomer: (
    name: string,
    phone?: string,
    cep?: string,
    address?: string,
    documentType?: 'cpf' | 'cnpj',
    documentValue?: string,
    picture?: string
  ) => CustomerClient;
  editCustomer: (
    id: string,
    name: string,
    phone: string,
    cep?: string,
    address?: string,
    documentType?: 'cpf' | 'cnpj',
    documentValue?: string,
    picture?: string
  ) => void;
  deleteCustomer: (id: string) => void;
  addDebt: (customerId: string, amount: number, description?: string) => void;
  receivePayment: (customerId: string, amount: number, method?: string) => void;
  editHistoryItem: (customerId: string, itemId: string, newDesc: string, newAmount: number) => void;
  deleteHistoryItem: (customerId: string, itemId: string) => void;
  
  // Smart System
  learnQuickItem: (name: string, price: number) => void;
  getSmartSuggestions: (query: string) => QuickItemClient[];
  
  // Offline Background Sync
  enqueueSync: (type: PendingQueueItem['type'], payload: Record<string, any>) => void;
  attemptBackgroundSync: () => Promise<void>;
  retryFailedSyncItems: () => Promise<void>;
  clearSyncQueue: () => void;
  flushSyncQueue: () => Promise<void>;
  backupOfflineUserData: (userId: string) => Promise<void>;
  restoreOfflineUserData: (userId: string) => Promise<void>;
  resetDemoData: () => void;
  loadSupabaseData: () => Promise<void>;
}

interface CustomerNormalizeInput {
  name?: string | null;
  full_name?: string | null;
  nome?: string | null;
  customer_name?: string | null;
  customerName?: string | null;
}

function normalizeCustomerForSupabase(input: CustomerNormalizeInput): {
  name: string | null;
  full_name: string | null;
} {
  // `name` is the canonical DB column (added in migration 20260524).
  // `full_name` is kept in sync by trigger. Prefer `name` first.
  const raw =
    input?.name ??
    input?.full_name ??
    input?.nome ??
    input?.customer_name ??
    input?.customerName ??
    '';
  const clean = String(raw || '').trim();
  const normalized = clean.length >= 2 ? clean : null;
  return { name: normalized, full_name: normalized };
}

function safePayloadKeys(payload: any): string[] {
  try {
    return Object.keys(payload || {}).sort();
  } catch {
    return [];
  }
}

function isUuid(val: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

export function isTempCustomerId(val: string) {
  const id = String(val || '');
  if (!id) return false;
  if (id.startsWith('cust_') || id.startsWith('temp_') || id.startsWith('local_') || id.startsWith('pending_')) return true;
  return !isUuid(id);
}

function isLikelyLocalImageUri(val?: string) {
  if (!val) return false;
  const s = String(val);
  if (!s) return false;
  return s.startsWith('file:') || s.startsWith('content:') || s.startsWith('ph:') || s.startsWith('assets-library:');
}

function mimeFromUri(uri?: string) {
  const u = String(uri || '').toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function isEmoji(str?: string) {
  if (!str) return false;
  const s = String(str).trim();
  try {
    const emojiRegex = new RegExp('^(\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)+$', 'u');
    return emojiRegex.test(s);
  } catch {
    return s.length <= 4 && !s.includes('/') && !s.startsWith('data:');
  }
}

function isTransientNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.description || err || '').toLowerCase();
  
  if (
    msg.includes('network request failed') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('connection aborted') ||
    msg.includes('offline')
  ) {
    return true;
  }
  
  if (err.status === 0 || err.status === 502 || err.status === 503 || err.status === 504) {
    return true;
  }
  
  return false;
}

async function signedUrlForCustomerPicture(path: string) {
  const { data, error } = await supabase.storage.from('customer-pictures').createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) throw error;
  return data?.signedUrl || null;
}

export const useFiadoStore = create<FiadoMobileState>()(
  persist(
    (set, get) => ({
      user: null,
      authChecked: false,
      businessConfig: {
        businessName: 'Meu Mercadinho',
        pixKey: 'mercadinho@bairro.com.br',
        phone: '11999999999',
      },
      currentBusinessId: null,
      setUser: (user) => {
        set({ user });
        if (user) {
          get().fetchSubscription();
          if (user.id) {
            get().restoreOfflineUserData(user.id);
          }
        } else {
          set({
            subscription: {
              plan_id: 'free',
              plan_name: 'Free',
              price_brl: 0,
              max_customers: 2,
              max_transactions_per_month: 30,
              is_premium: false,
              status: 'active',
              current_period_end: null,
              is_simulated: false,
              source: 'cloud',
            }
          });
        }
      },
      setAuthChecked: (checked) => set({ authChecked: checked }),
      updateBusinessConfig: (config) =>
        set((state) => ({
          businessConfig: { ...state.businessConfig, ...config },
        })),

      subscription: {
        plan_id: 'free',
        plan_name: 'Free',
        price_brl: 0,
        max_customers: 2,
        max_transactions_per_month: 30,
        is_premium: false,
        status: 'active',
        current_period_end: null,
        is_simulated: false,
        source: 'cloud',
      },

      fetchSubscription: async () => {
        const { user, subscription } = get();
        if (!user || subscription.is_simulated) return;
        try {
          const { data, error } = await supabase.rpc('get_current_plan');
          if (error) throw error;
          const row = Array.isArray(data) ? data[0] : data;
          if (row) {
            set({
              subscription: {
                plan_id: row.plan_id || 'free',
                plan_name: row.plan_name || 'Free',
                price_brl: Number(row.price_brl || 0),
                max_customers: row.max_customers,
                max_transactions_per_month: row.max_transactions_per_month,
                is_premium: !!row.is_premium,
                status: row.status || 'active',
                current_period_end: row.current_period_end || null,
                is_simulated: false,
                source: row.source === 'google_play' ? 'play' : 'cloud',
              }
            });
          }
        } catch (err) {
          console.warn('[Store] Falha ao buscar assinatura da nuvem:', err);
        }
      },

      toggleSubscriptionSimulation: (enabled, planId = 'premium_monthly') => {
        if (enabled) {
          const isPremium = planId === 'premium_monthly';
          set({
            subscription: {
              plan_id: planId,
              plan_name: isPremium ? 'Premium Mensal' : 'Free',
              price_brl: isPremium ? 11.99 : 0,
              max_customers: isPremium ? null : 2,
              max_transactions_per_month: isPremium ? null : 30,
              is_premium: isPremium,
              status: 'active',
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              is_simulated: true,
              source: 'simulated',
            }
          });
        } else {
          set((state) => ({
            subscription: {
              ...state.subscription,
              is_simulated: false,
              source: 'cloud',
            }
          }));
          if (get().user) {
            get().fetchSubscription();
          } else {
            set({
              subscription: {
                plan_id: 'free',
                plan_name: 'Free',
                price_brl: 0,
                max_customers: 2,
                max_transactions_per_month: 30,
                is_premium: false,
                status: 'active',
                current_period_end: null,
                is_simulated: false,
                source: 'cloud',
              }
            });
          }
        }
      },

      simulateSubscriptionUpgrade: (method) => {
        set({
          subscription: {
            plan_id: 'premium_monthly',
            plan_name: 'Premium Mensal',
            price_brl: 11.99,
            max_customers: null,
            max_transactions_per_month: null,
            is_premium: true,
            status: 'active',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            is_simulated: true,
            source: 'simulated',
          }
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },

      simulateSubscriptionDowngrade: () => {
        set({
          subscription: {
            plan_id: 'free',
            plan_name: 'Free',
            price_brl: 0,
            max_customers: 2,
            max_transactions_per_month: 30,
            is_premium: false,
            status: 'active',
            current_period_end: null,
            is_simulated: true,
            source: 'simulated',
          }
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      },

      setPlayPremiumActive: (active) => {
        set((state) => ({
          subscription: {
            ...state.subscription,
            plan_id: active ? 'premium_monthly' : 'free',
            plan_name: active ? 'Premium Mensal' : 'Free',
            price_brl: active ? 11.99 : 0,
            max_customers: active ? null : 2,
            max_transactions_per_month: active ? null : 30,
            is_premium: active,
            status: 'active',
            current_period_end: active ? state.subscription.current_period_end : null,
            is_simulated: false,
            source: 'play',
          },
        }));
      },

      getActiveCustomersCount: () => {
        return get().customers.length;
      },

      getCurrentMonthTransactionsCount: () => {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        let count = 0;
        const start = startOfMonth.getTime();
        for (const c of get().customers) {
          for (const h of c.history) {
            if (h.type === 'debt' || h.type === 'payment') {
              const t = new Date(h.created_at).getTime();
              if (t >= start) {
                count++;
              }
            }
          }
        }
        return count;
      },

      customers: [],
      quickItems: [],
      syncQueue: [],
      failedSyncItems: [],
      customerIdMap: {},
      isSyncing: false,
      hasBootstrappedProfile: false,

      novoFiadoState: { isOpen: false, customerId: undefined },
      openNovoFiado: (customerId) => set({ novoFiadoState: { isOpen: true, customerId } }),
      closeNovoFiado: () => set({ novoFiadoState: { isOpen: false, customerId: undefined } }),

      novoClienteState: { isOpen: false },
      openNovoCliente: () => set({ novoClienteState: { isOpen: true } }),
      closeNovoCliente: () => set({ novoClienteState: { isOpen: false } }),

      refreshCustomerPictureUrls: async () => {
        try {
          const session = (await supabase.auth.getSession()).data.session;
          if (!session) return;

          const list = get().customers;
          const promises = list.map(async (c) => {
            if (isEmoji(c.picture)) return null;
            const path = String(c.picture_storage_path || '').trim();
            if (!path) return null;

            // Check age: if picture URL exists and was updated less than 6 days ago (expiry is 7 days), skip!
            if (c.picture && c.picture_updated_at) {
              const ageMs = Date.now() - new Date(c.picture_updated_at).getTime();
              const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
              if (ageMs < sixDaysMs) {
                return null;
              }
            }

            try {
              const url = await signedUrlForCustomerPicture(path);
              if (url) return { id: c.id, url };
            } catch {
              // ignore
            }
            return null;
          });

          const results = await Promise.all(promises);
          const updates = results.filter((x): x is { id: string; url: string } => x !== null);
          if (updates.length === 0) return;

          set((state) => ({
            customers: state.customers.map((c) => {
              const u = updates.find((x) => x.id === c.id);
              return u ? { ...c, picture: u.url, picture_updated_at: new Date().toISOString() } : c;
            }),
          }));
        } catch {
          // ignore
        }
      },

      addCustomer: (name, phone = '', cep = '', address = '', documentType, documentValue = '', picture = '') => {
        const sub = get().subscription;
        if (sub.max_customers !== null) {
          const activeCount = get().getActiveCustomersCount();
          if (activeCount >= sub.max_customers) {
            throw new Error('FREE_PLAN_CUSTOMER_LIMIT_REACHED');
          }
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const newCust: CustomerClient = {
          id: localId('cust'),
          business_id: get().currentBusinessId || 'pending_sync',
          name: name.trim(),
          full_name: name.trim(),
          phone: cleanPhone,
          whatsapp: cleanPhone,
          total_debt: 0,
          created_at: new Date().toISOString(),
          history: [],
          cep,
          address,
          documentType,
          documentValue,
          picture,
          picture_storage_path: null,
          picture_mime_type: null,
        };

        set((state) => ({
          customers: [newCust, ...state.customers],
        }));

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        get().enqueueSync('create_customer', {
          ...newCust,
          name: newCust.full_name,
          full_name: newCust.full_name,
          customerName: newCust.full_name,
          customer_name: newCust.full_name,
        });

        // If a local photo was selected, upload after the customer gets a real UUID.
        if (isLikelyLocalImageUri(picture)) {
          get().enqueueSync('update_customer', {
            id: newCust.id,
            full_name: newCust.full_name,
            name: newCust.full_name,
            phone: newCust.phone,
            cep: newCust.cep,
            address: newCust.address,
            documentType: newCust.documentType,
            documentValue: newCust.documentValue,
            picture: newCust.picture,
            picture_local_uri: picture,
            picture_mime_type: mimeFromUri(picture),
          });
        }
        return newCust;
      },

      editCustomer: (id, name, phone, cep, address, documentType, documentValue, picture) => {
        set((state) => {
          const updated = state.customers.map((c) => {
            if (c.id === id) {
              const cleanPhone = phone.replace(/\D/g, '');
              const newHistory = [
                {
                  id: localId('hist'),
                  description: 'Perfil Atualizado',
                  amount: 0,
                  created_at: new Date().toISOString(),
                  type: 'system' as const,
                  created_by: state.user?.full_name || 'Dono',
                },
                ...c.history,
              ];
              return {
                ...c,
                full_name: name.trim() || c.full_name,
                phone: cleanPhone,
                whatsapp: cleanPhone,
                cep: cep !== undefined ? cep : c.cep,
                address: address !== undefined ? address : c.address,
                documentType: documentType !== undefined ? documentType : c.documentType,
                documentValue: documentValue !== undefined ? documentValue : c.documentValue,
                picture: picture !== undefined ? picture : c.picture,
                history: newHistory,
              };
            }
            return c;
          });

          return { customers: updated };
        });

        const cust = get().customers.find((c) => c.id === id);
        if (cust) {
          get().enqueueSync('update_customer', { 
            id, 
            full_name: cust.full_name, 
            name: cust.full_name,
            phone: cust.phone,
            cep: cust.cep,
            address: cust.address,
            documentType: cust.documentType,
            documentValue: cust.documentValue,
            picture: cust.picture,
            ...(isLikelyLocalImageUri(cust.picture) ? { picture_local_uri: cust.picture, picture_mime_type: mimeFromUri(cust.picture) } : {}),
            ...(cust.picture === '' || (cust.picture && isEmoji(cust.picture)) ? { clear_photo: true } : {}),
          });
        }
      },

      deleteCustomer: (id) => {
        const isTemp = isTempCustomerId(id);
        set((state) => ({
          customers: state.customers.filter((c) => c.id !== id),
          syncQueue: state.syncQueue.filter((item) => {
            // Remove any pending creation or updates for this customer
            if (item.type === 'create_customer' && item.payload.id === id) return false;
            if (item.type === 'update_customer' && item.payload.id === id) return false;
            // Remove any pending transactions for this customer
            const payloadCustId = item.payload.customer_id || item.payload.customerId || item.payload.client_id || item.payload.clientId;
            if (payloadCustId === id) return false;
            return true;
          }),
        }));

        if (!isTemp) {
          get().enqueueSync('delete_customer', { id });
        }
      },

      addDebt: (customerId, amount, description = 'Fiado') => {
        const sub = get().subscription;
        if (!sub.is_premium && sub.max_transactions_per_month !== null) {
          const txCount = get().getCurrentMonthTransactionsCount();
          if (txCount >= sub.max_transactions_per_month) {
            throw new Error('FREE_PLAN_TRANSACTION_LIMIT_REACHED');
          }
        }

        const cleanDesc = description.trim() || 'Fiado / Balcão';
        let localTxId = '';
        set((state) => {
          const updated = state.customers.map((c) => {
            if (c.id === customerId) {
              const newItem: HistoryItem = {
                id: localId('hist'),
                description: cleanDesc,
                amount,
                created_at: new Date().toISOString(),
                type: 'debt',
                created_by: state.user?.full_name || 'Dono',
              };
              localTxId = newItem.id;
              const newHistory = [newItem, ...c.history];
              const total_debt = Number((c.total_debt + amount).toFixed(2));
              return { ...c, total_debt, history: newHistory };
            }
            return c;
          });
          // Move o cliente alterado para o topo da lista
          const target = updated.find((c) => c.id === customerId);
          const rest = updated.filter((c) => c.id !== customerId);
          return { customers: target ? [target, ...rest] : updated };
        });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        get().learnQuickItem(cleanDesc, amount);
        get().enqueueSync('debt', { customer_id: customerId, amount, description: cleanDesc, local_id: localTxId });
      },

      receivePayment: (customerId, amount, method = 'dinheiro') => {
        const sub = get().subscription;
        if (!sub.is_premium && sub.max_transactions_per_month !== null) {
          const txCount = get().getCurrentMonthTransactionsCount();
          if (txCount >= sub.max_transactions_per_month) {
            throw new Error('FREE_PLAN_TRANSACTION_LIMIT_REACHED');
          }
        }

        const customer = get().customers.find((c) => c.id === customerId);
        if (customer && amount > customer.total_debt) {
          throw new Error('PAYMENT_EXCEEDS_DEBT');
        }

        const methodLabel = method === 'PIX' ? 'Pagamento PIX' : method === 'cartao' ? 'Pagamento Cartão' : 'Pagamento Dinheiro';
        let localTxId = '';
        set((state) => {
          const updated = state.customers.map((c) => {
            if (c.id === customerId) {
              const newItem: HistoryItem = {
                id: localId('hist'),
                description: methodLabel,
                amount,
                created_at: new Date().toISOString(),
                type: 'payment',
                created_by: state.user?.full_name || 'Dono',
              };
              localTxId = newItem.id;
              const newHistory = [newItem, ...c.history];
              const total_debt = Number(Math.max(0, c.total_debt - amount).toFixed(2));
              return { ...c, total_debt, history: newHistory };
            }
            return c;
          });
          return { customers: updated };
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        get().enqueueSync('payment', { customer_id: customerId, amount, description: methodLabel, local_id: localTxId });
      },

      editHistoryItem: (customerId, itemId, newDesc, newAmount) => {
        const customer = get().customers.find((c) => c.id === customerId);
        if (!customer) return;
        const originalItem = customer.history.find((h) => h.id === itemId);
        if (!originalItem) return;

        const cleanDesc = newDesc.trim();
        if (originalItem.description === cleanDesc && originalItem.amount === newAmount) {
          return;
        }

        const sub = get().subscription;
        if (!sub.is_premium && sub.max_transactions_per_month !== null) {
          const txCount = get().getCurrentMonthTransactionsCount();
          if (txCount >= sub.max_transactions_per_month) {
            throw new Error('FREE_PLAN_TRANSACTION_LIMIT_REACHED');
          }
        }

        set((state) => {
          const updated = state.customers.map((c) => {
            if (c.id === customerId) {
              const history = c.history.map((h) => {
                if (h.id === itemId) {
                  return { ...h, description: newDesc.trim() || h.description, amount: newAmount };
                }
                return h;
              });
              // Recalcula dívida total
              let debts = 0;
              let pays = 0;
              history.forEach((h) => {
                if (h.type === 'debt') debts += h.amount;
                if (h.type === 'payment') pays += h.amount;
              });
              const total_debt = Number(Math.max(0, debts - pays).toFixed(2));

              // Log de auditoria
              const auditLog: HistoryItem = {
                id: localId('hist'),
                description: `Auditoria: Edição do item`,
                amount: 0,
                created_at: new Date().toISOString(),
                type: 'system',
                created_by: state.user?.full_name || 'Dono',
              };

              return { ...c, total_debt, history: [auditLog, ...history] };
            }
            return c;
          });
          return { customers: updated };
        });

        // Persist to DB: delete the old transaction row then recreate with the
        // new values. The DB trigger recomputes total_debt on DELETE + INSERT
        // automatically — no manual update needed.
        if (!itemId.startsWith('hist_')) {
          get().enqueueSync('delete_transaction', { id: itemId });
        }
        const txType = (originalItem.type === 'debt' || originalItem.type === 'payment')
          ? originalItem.type
          : 'debt';
        get().enqueueSync(txType, {
          customer_id: customerId,
          amount: newAmount,
          description: (newDesc.trim() || originalItem.description),
          local_id: localId('hist_edit'),
        });
      },

      deleteHistoryItem: (customerId, itemId) => {
        const isTemp = !itemId || itemId.startsWith('hist_');
        set((state) => {
          const syncQueueFiltered = isTemp 
            ? state.syncQueue.filter((q) => !((q.type === 'debt' || q.type === 'payment') && q.payload?.local_id === itemId))
            : state.syncQueue;

          const updated = state.customers.map((c) => {
            if (c.id === customerId) {
              const target = c.history.find((h) => h.id === itemId);
              const history = c.history.filter((h) => h.id !== itemId);
              
              let debts = 0;
              let pays = 0;
              history.forEach((h) => {
                if (h.type === 'debt') debts += h.amount;
                if (h.type === 'payment') pays += h.amount;
              });
              const total_debt = Number(Math.max(0, debts - pays).toFixed(2));

              const auditLog: HistoryItem = {
                id: localId('hist'),
                description: `Estorno: Removido item (${target?.amount || 0})`,
                amount: 0,
                created_at: new Date().toISOString(),
                type: 'system',
                created_by: state.user?.full_name || 'Dono',
              };

              return { ...c, total_debt, history: [auditLog, ...history] };
            }
            return c;
          });
          return { customers: updated, syncQueue: syncQueueFiltered };
        });

        if (!isTemp) {
          get().enqueueSync('delete_transaction', { id: itemId });
        }
      },

      learnQuickItem: (name, price) => {
        const cleanName = name.trim();
        if (!cleanName) return;

        set((state) => {
          const existing = state.quickItems.find((q) => q.name.toLowerCase() === cleanName.toLowerCase());
          if (existing) {
            const updated = state.quickItems.map((q) =>
              q.name.toLowerCase() === cleanName.toLowerCase()
                ? { ...q, count: q.count + 1, lastUsed: new Date().toISOString(), price: price > 0 ? price : q.price }
                : q
            );
            return { quickItems: updated };
          } else {
            return {
              quickItems: [
                ...state.quickItems,
                { name: cleanName, price, count: 1, lastUsed: new Date().toISOString() },
              ],
            };
          }
        });
      },

      getSmartSuggestions: (query) => {
        const items = get().quickItems;
        let sorted = [...items].sort((a, b) => {
          const scoreA = a.count * 2 + new Date(a.lastUsed).getTime() / 1000000000;
          const scoreB = b.count * 2 + new Date(b.lastUsed).getTime() / 1000000000;
          return scoreB - scoreA;
        });

        // Add defaults if empty
        if (sorted.length === 0) {
          sorted = [
            { name: 'Pão', price: 5, count: 1, lastUsed: new Date().toISOString() },
            { name: 'Coca-cola', price: 8, count: 1, lastUsed: new Date().toISOString() },
            { name: 'Cerveja', price: 6, count: 1, lastUsed: new Date().toISOString() },
            { name: 'Salgado', price: 7, count: 1, lastUsed: new Date().toISOString() },
            { name: 'Doces', price: 3, count: 1, lastUsed: new Date().toISOString() },
          ];
        }

        const cleanQuery = query.toLowerCase().trim();
        if (!cleanQuery) return sorted.slice(0, 8);

        return sorted
          .filter((item) => item.name.toLowerCase().includes(cleanQuery))
          .slice(0, 8);
      },

      enqueueSync: (type, payload) => {
        const item: PendingQueueItem = {
          id: localId('sync'),
          type,
          payload,
          added_at: new Date().toISOString(),
        };
        set((state) => ({
          syncQueue: [...state.syncQueue, item],
        }));
        get().attemptBackgroundSync();
      },

      clearSyncQueue: () => {
        set({ syncQueue: [], failedSyncItems: [], customerIdMap: {} });
      },

      flushSyncQueue: async () => {
        if (get().syncQueue.length === 0) {
          return;
        }

        if (get().isSyncing) {
          console.log('[Sync] Já sincronizando. Aguardando conclusão para logout...');
          while (get().isSyncing) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          console.log('[Sync] Não há sessão ativa para esvaziar fila.');
          return;
        }

        console.log('[Sync] Forçando sincronização imediata de toda a fila...');
        await get().attemptBackgroundSync();

        let retries = 50;
        while (get().isSyncing && retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries--;
        }
      },

      backupOfflineUserData: async (userId: string) => {
        if (!userId || userId === 'usr_offline') return;
        try {
          const { customers, syncQueue, failedSyncItems, customerIdMap } = get();
          if (customers.length > 0 || syncQueue.length > 0) {
            const dataToSave = {
              customers,
              syncQueue,
              failedSyncItems,
              customerIdMap,
              savedAt: new Date().toISOString(),
            };
            const storageKey = `fiado_offline_data_${userId}`;
            await AsyncStorage.setItem(storageKey, JSON.stringify(dataToSave));
            console.log(`[Backup] Dados locais do usuário ${userId} salvos em backup offline.`);
          }
        } catch (err) {
          console.warn('[Backup] Falha ao criar backup offline dos dados do usuário:', err);
        }
      },

      restoreOfflineUserData: async (userId: string) => {
        if (!userId || userId === 'usr_offline') return;
        try {
          const storageKey = `fiado_offline_data_${userId}`;
          const raw = await AsyncStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed) {
              console.log(`[Restore] Restaurando dados offline para o usuário ${userId}...`);
              
              const currentStore = get();
              
              const mergedCustomers = [...currentStore.customers];
              const restoredCustomers = parsed.customers || [];
              for (const rc of restoredCustomers) {
                if (!mergedCustomers.some(c => c.id === rc.id)) {
                  mergedCustomers.push(rc);
                }
              }

              const mergedQueue = [...currentStore.syncQueue];
              const restoredQueue = parsed.syncQueue || [];
              for (const rq of restoredQueue) {
                if (!mergedQueue.some(q => q.id === rq.id)) {
                  mergedQueue.push(rq);
                }
              }

              const mergedFailed = [...currentStore.failedSyncItems];
              const restoredFailed = parsed.failedSyncItems || [];
              for (const rf of restoredFailed) {
                if (!mergedFailed.some(f => f.id === rf.id)) {
                  mergedFailed.push(rf);
                }
              }

              const mergedMap = { ...currentStore.customerIdMap, ...(parsed.customerIdMap || {}) };

              set({
                customers: mergedCustomers,
                syncQueue: mergedQueue,
                failedSyncItems: mergedFailed,
                customerIdMap: mergedMap,
              });

              await AsyncStorage.removeItem(storageKey);
              console.log(`[Restore] Dados restaurados com sucesso. Fila de sync: ${mergedQueue.length} itens.`);
              
              if (mergedQueue.length > 0) {
                get().attemptBackgroundSync();
              }
            }
          }
        } catch (err) {
          console.warn('[Restore] Falha ao restaurar backup offline dos dados:', err);
        }
      },

      retryFailedSyncItems: async () => {
        const { failedSyncItems, syncQueue } = get();
        if (failedSyncItems.length === 0) return;

        // Limpa os campos failed_reason, failed_at, error_details dos itens de falha
        const restored = failedSyncItems.map((item) => {
          const { failed_reason, failed_at, error_details, ...original } = item as any;
          return original;
        });

        set({
          syncQueue: [...restored, ...syncQueue],
          failedSyncItems: [],
        });

        // Dispara a sincronização
        await get().attemptBackgroundSync();
      },

      attemptBackgroundSync: async () => {
        const { syncQueue, isSyncing, businessConfig, user } = get();
        if (isSyncing || syncQueue.length === 0) return;

        set({ isSyncing: true });

        let sessionData = null;
        try {
          const { data } = await supabase.auth.getSession();
          sessionData = data;
        } catch (e) {
          console.log('[Sync] Banco offline ou erro de rede. Sincronização pausada.');
          set({ isSyncing: false });
          scheduleSyncRetry('SESSION_FETCH_FAILED', () => {
            get().attemptBackgroundSync();
          });
          return;
        }

        if (!sessionData?.session) {
          console.log('[Sync] Usuário não autenticado. Sincronização pausada.');
          set({ isSyncing: false });
          return;
        }

        // Garante que existe um profile/business associado ao usuário antes de usar RPCs que dependem de business_id.
        // (Sem isso, get_current_business_id() pode retornar null e quebrar inserts.)
        let bizId = null;
        try {
          const { data, error } = await supabase.rpc('get_current_business_id');
          if (error) throw error;
          bizId = data;
          if (bizId) set({ currentBusinessId: String(bizId) });
        } catch (e: any) {
          const msg = e?.message || String(e || '');
          if (msg.includes('JWT') || msg.includes('authenticated') || msg.includes('auth')) {
            console.log('[Sync] Falha de autenticação ao buscar business_id. Tentando refresh de sessão...');
            try {
              const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
              if (!refreshErr && refreshData?.session) {
                console.log('[Sync] Sessão atualizada com sucesso. Refazendo chamada...');
                const { data: retryData } = await supabase.rpc('get_current_business_id');
                bizId = retryData;
                if (bizId) set({ currentBusinessId: String(bizId) });
              }
            } catch (err: any) {
              console.log('[Sync] Falha ao atualizar sessão:', err?.message || err);
            }
          } else {
            console.log('[Sync] Não foi possível validar business_id:', msg);
          }
        }

        if (!bizId) {
          console.log('[Sync] business_id ausente no servidor. Tentando inicializar perfil/loja...');
          try {
            const phone = (businessConfig.phone || (user as any)?.phone || '').replace(/\D/g, '');
            let newBizId = null;
            try {
              newBizId = await bootstrapOwnerProfile({
                business_name: businessConfig.businessName || 'Meu Estabelecimento',
                owner_name: user?.full_name || user?.email?.split('@')[0] || 'Dono',
                phone: phone || undefined,
              });
            } catch (err: any) {
              const msg = err?.message || String(err || '');
              if (msg.includes('JWT') || msg.includes('authenticated') || msg.includes('auth')) {
                console.log('[Sync] Falha de autenticação no bootstrap. Tentando refresh...');
                const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
                if (!refreshErr && refreshData?.session) {
                  newBizId = await bootstrapOwnerProfile({
                    business_name: businessConfig.businessName || 'Meu Estabelecimento',
                    owner_name: user?.full_name || user?.email?.split('@')[0] || 'Dono',
                    phone: phone || undefined,
                  });
                } else {
                  throw err;
                }
              } else {
                throw err;
              }
            }

            if (newBizId) {
              bizId = newBizId;
              set({ hasBootstrappedProfile: true, currentBusinessId: String(newBizId) });
              console.log('[Sync] Perfil/loja inicializado com sucesso. business_id:', bizId);
            }
          } catch (e: any) {
            console.log('[Sync] Falha ao inicializar perfil/loja:', e?.message || e);
          }
        }

        if (!bizId) {
          console.log('[Sync] business_id ausente. Configure o telefone da loja em Config e tente novamente.');
          set({ isSyncing: false });
          return;
        }

        console.log(`[Sync] Iniciando sincronização em lote de ${syncQueue.length} itens...`);
        set({ isSyncing: true });
        
        let remainingQueue = [...syncQueue].sort((a, b) => {
          const weight = (t: PendingQueueItem['type']) =>
            t === 'create_customer' || t === 'update_customer' ? 0 : 1;
          return weight(a.type) - weight(b.type);
        });
        const processedIds: string[] = [];

        try {
          // Processa tudo em ordem (mantém consistência quando IDs temporários viram UUIDs)
          for (const item of remainingQueue) {
            let success = false;
            let retriesLeft = 1;

            while (!success && retriesLeft >= 0) {
              try {
              if (item.type === 'create_customer') {
                // A tabela customers tem RLS com "Deny direct insert" — criar via RPC segura.
                const oldId = String(item.payload.id || '');
                const cep = String(item.payload.cep || '').trim();
                const address = String(item.payload.address || '').trim();
                const docType = String(item.payload.documentType || '').trim();
                const docValue = String(item.payload.documentValue || '').trim();
                const normalized = normalizeCustomerForSupabase(item.payload);
                if (!normalized.full_name) {
                  console.warn(
                    `[Sync] Cliente inválido (sem nome). Removendo item ${item.id}. payloadKeys=${safePayloadKeys(item.payload).join(',')}`,
                  );
                  set((state) => ({
                    failedSyncItems: [
                      ...state.failedSyncItems,
                      { ...(item as any), failed_reason: 'MISSING_NAME', failed_at: new Date().toISOString() },
                    ].slice(-50),
                  }));
                  processedIds.push(item.id);
                  continue;
                }

                const { data: created, error: createErr } = await supabase.rpc('create_customer_secure', {
                  p_name: normalized.full_name,
                  p_phone: item.payload.phone || '',
                  p_email: item.payload.email || null,
                  p_address: address || null,
                  p_notes: item.payload.notes || null,
                  p_credit_limit: 0,
                  p_picture_storage_path: item.payload.picture_storage_path || null,
                  p_picture_mime_type: item.payload.picture_mime_type || null,
                  p_cep: cep || null,
                  p_document_type: docType || null,
                  p_document_value: docValue || null,
                });
                if (createErr) throw createErr;

                // Substitui ID local temporário pelo UUID real e reescreve itens pendentes que referenciam o ID antigo.
                if (oldId && isTempCustomerId(oldId) && created?.id) {
                  const realBizId: string | undefined = (created as any).business_id;
                  set((state) => ({
                    // Persist the real business UUID so future addCustomer calls use it.
                    currentBusinessId: realBizId || state.currentBusinessId,
                    customerIdMap: { ...state.customerIdMap, [oldId]: String(created.id) },
	                    customers: state.customers.map((c) =>
	                      c.id === oldId
	                        ? {
	                            ...c,
	                            id: String(created.id),
	                            business_id: realBizId || c.business_id,
	                            full_name: (created as any).full_name || c.full_name,
	                            phone: (created as any).phone || c.phone,
	                            picture_storage_path: (created as any).picture_storage_path ?? c.picture_storage_path ?? null,
	                            picture_mime_type: (created as any).picture_mime_type ?? c.picture_mime_type ?? null,
	                          }
	                        : c,
	                    ),
                    syncQueue: state.syncQueue.map((q) => {
                      if (q.payload?.customer_id === oldId) {
                        return { ...q, payload: { ...q.payload, customer_id: String(created.id) } };
                      }
                      if (q.payload?.customerId === oldId) {
                        return { ...q, payload: { ...q.payload, customerId: String(created.id) } };
                      }
                      if (q.payload?.client_id === oldId) {
                        return { ...q, payload: { ...q.payload, client_id: String(created.id) } };
                      }
                      if (q.payload?.clientId === oldId) {
                        return { ...q, payload: { ...q.payload, clientId: String(created.id) } };
                      }
                      if (q.type === 'update_customer' && q.payload?.id === oldId) {
                        return { ...q, payload: { ...q.payload, id: String(created.id) } };
                      }
                      return q;
                    }),
                  }));

                  remainingQueue = remainingQueue.map((q) => {
                    if (q.payload?.customer_id === oldId) return { ...q, payload: { ...q.payload, customer_id: String(created.id) } };
                    if (q.payload?.customerId === oldId) return { ...q, payload: { ...q.payload, customerId: String(created.id) } };
                    if (q.payload?.client_id === oldId) return { ...q, payload: { ...q.payload, client_id: String(created.id) } };
                    if (q.payload?.clientId === oldId) return { ...q, payload: { ...q.payload, clientId: String(created.id) } };
                    if (q.type === 'update_customer' && q.payload?.id === oldId) return { ...q, payload: { ...q.payload, id: String(created.id) } };
                    return q;
                  });
                }
                success = true;
              } else if (item.type === 'update_customer') {
                const customerId = String(item.payload.id || '');
                const mapped = get().customerIdMap[customerId] || null;
                const resolvedId = mapped || customerId;
                if (isTempCustomerId(resolvedId)) {
                  console.log(`[Sync] Update cliente pendente aguardando mapeamento. item=${item.id} customerId=${customerId}`);
                } else {
                  const normalized = normalizeCustomerForSupabase(item.payload);
                  if (!normalized.full_name) {
                    console.warn(
                      `[Sync] Update inválido (sem nome). Removendo item ${item.id}. payloadKeys=${safePayloadKeys(item.payload).join(',')}`,
                    );
                    set((state) => ({
                      failedSyncItems: [
                        ...state.failedSyncItems,
                        { ...(item as any), failed_reason: 'MISSING_NAME', failed_at: new Date().toISOString() },
                      ].slice(-50),
                    }));
                    processedIds.push(item.id);
                    continue;
                  }

                  let picture_storage_path: string | null | undefined = item.payload.picture_storage_path;
                  let picture_mime_type: string | null | undefined = item.payload.picture_mime_type;

                  if (item.payload.clear_photo) {
                    await updateCustomer({
                      customer_id: resolvedId,
                      name: normalized.full_name,
                      phone: item.payload.phone,
                      address: item.payload.address,
                      clear_photo: true,
                      cep: item.payload.cep,
                      document_type: item.payload.documentType,
                      document_value: item.payload.documentValue,
                    });
                    set((state) => ({
                      customers: state.customers.map((c) =>
                        c.id === resolvedId ? { ...c, picture: '', picture_storage_path: null, picture_mime_type: null } : c,
                      ),
                    }));
                    success = true;
                  } else {
                    const localUri = String(item.payload.picture_local_uri || '');
                    if (localUri && isLikelyLocalImageUri(localUri)) {
                      const session = (await supabase.auth.getSession()).data.session;
                      const userId = session?.user?.id;
                      if (userId) {
                        const mime = String(item.payload.picture_mime_type || mimeFromUri(localUri));
                        const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
                        const path = `${userId}/${resolvedId}/avatar.${ext}`;
                        try {
                          const resp = await fetch(localUri);
                          if (!resp.ok) throw new Error('FETCH_FAILED');
                          const blob = await resp.blob();
                          const { error: upErr } = await supabase.storage
                            .from('customer-pictures')
                            .upload(path, blob as any, { contentType: mime, upsert: true } as any);
                          if (upErr) throw upErr;
                          picture_storage_path = path;
                          picture_mime_type = mime;
                        } catch (e: any) {
                          console.log(
                            `[Sync] Falha upload foto cliente (URI local inválida ou erro de rede). item=${item.id} customerId=${resolvedId}`,
                            e
                          );
                          const isNetworkErr = isTransientNetworkError(e);
                          if (!isNetworkErr) {
                            set((state) => ({
                              customers: state.customers.map((c) =>
                                c.id === resolvedId ? { ...c, picture: undefined, picture_storage_path: null, picture_mime_type: null, picture_updated_at: undefined } : c
                              ),
                            }));
                          }
                          throw e;
                        }
                      }
                    }

                    await updateCustomer({
                      customer_id: resolvedId,
                      name: normalized.full_name,
                      phone: item.payload.phone,
                      address: item.payload.address,
                      picture_storage_path,
                      picture_mime_type,
                      cep: item.payload.cep,
                      document_type: item.payload.documentType,
                      document_value: item.payload.documentValue,
                    });

                    if (picture_storage_path) {
                      try {
                        const url = await signedUrlForCustomerPicture(String(picture_storage_path));
                        set((state) => ({
                          customers: state.customers.map((c) =>
                            c.id === resolvedId
                              ? {
                                  ...c,
                                  picture: url || c.picture,
                                  picture_storage_path: String(picture_storage_path),
                                  picture_mime_type: picture_mime_type ?? null,
                                  picture_updated_at: new Date().toISOString(),
                                }
                              : c,
                          ),
                        }));
                      } catch {
                        // ignore
                      }
                    }
                    success = true;
                  }
                }
              } else if (item.type === 'debt' || item.type === 'payment') {
                const rawCustomerId = String(
                  item.payload.customer_id || item.payload.customerId || item.payload.client_id || item.payload.clientId || '',
                );
                const mapped = get().customerIdMap[rawCustomerId] || null;
                const resolvedCustomerId = mapped || rawCustomerId;
                if (!resolvedCustomerId || isTempCustomerId(resolvedCustomerId)) {
                  const existsLocally = get().customers.some((c) => c.id === rawCustomerId);
                  if (!existsLocally) {
                    console.warn(`[Sync] Transação órfã (cliente não existe). Removendo item ${item.id}. customerId=${rawCustomerId}`);
                    set((state) => ({
                      failedSyncItems: [
                        ...state.failedSyncItems,
                        { ...(item as any), failed_reason: 'ORPHAN_TRANSACTION_CUSTOMER', failed_at: new Date().toISOString() },
                      ].slice(-50),
                    }));
                    processedIds.push(item.id);
                  } else {
                    console.log(`[Sync] Transação pendente aguardando mapeamento do cliente. item=${item.id} customerId=${rawCustomerId}`);
                  }
                } else {
                  const amount = Number(item.payload.amount || 0);
                  const description = String(item.payload.description || '');
                  // Support both known param names across migrations: p_transaction_type or p_type.
                  let txError: any = null;
                  let createdTx: any = null;
                  {
                    const { data, error } = await supabase.rpc('create_customer_transaction_secure', {
                      p_customer_id: resolvedCustomerId,
                      p_amount: amount,
                      p_description: description,
                      p_transaction_type: item.type,
                    });
                    txError = error;
                    createdTx = data;
                  }
                  if (txError) {
                    const { data, error } = await supabase.rpc('create_customer_transaction_secure', {
                      p_customer_id: resolvedCustomerId,
                      p_amount: amount,
                      p_description: description,
                      p_type: item.type,
                    });
                    if (error) throw error;
                    createdTx = data;
                  }

                  const localTxId = item.payload.local_id;
                  if (localTxId && createdTx?.id) {
                    set((state) => ({
                      customers: state.customers.map((c) => {
                        if (c.id === resolvedCustomerId) {
                          return {
                            ...c,
                            history: c.history.map((h) =>
                              h.id === localTxId ? { ...h, id: String(createdTx.id) } : h
                            ),
                          };
                        }
                        return c;
                      }),
                    }));
                  }
                  success = true;
                }
              } else if (item.type === 'delete_customer') {
                const customerId = String(item.payload.id || '');
                await apiDeleteCustomer(customerId);
                success = true;
              } else if (item.type === 'delete_transaction') {
                const txId = String(item.payload.id || '');
                await apiDeleteTransaction(txId);
                success = true;
              }
              } catch (e: any) {
                const msg = e?.message || String(e || '');
                const isAuthError =
                  String(msg).includes('NOT_AUTHENTICATED') ||
                  String(msg).includes('JWT') ||
                  String(msg).includes('authenticated') ||
                  e?.status === 401 ||
                  e?.status === 403;

                if (isAuthError && retriesLeft > 0) {
                  console.log(`[Sync] Falha de autenticação detectada para item ${item.id}. Tentando atualizar sessão e reenviar...`);
                  retriesLeft--;
                  try {
                    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
                    if (!refreshErr && refreshData?.session) {
                      console.log('[Sync] Sessão atualizada com sucesso. Retentando operação...');
                      continue; // Retenta
                    }
                  } catch (refreshEx) {
                    console.log('[Sync] Falha ao tentar atualizar sessão:', refreshEx);
                  }
                }

                // Se não é erro de auth, ou esgotou retentativas, entra na lógica de erro persistente / temporário
                if (String(msg).includes('NOT_AUTHENTICATED')) {
                  console.log('[Sync] Sessão expirou de forma definitiva. Sincronização pausada.');
                  set({ isSyncing: false });
                  return;
                }
                if (String(msg).includes('BUSINESS_CONTEXT_MISSING')) {
                  console.log('[Sync] Contexto da loja ausente. Configure o telefone da loja em Config e tente novamente.');
                  set({ isSyncing: false });
                  return;
                }
                if (isTransientNetworkError(e)) {
                  console.log('[Sync] Erro de rede temporário. Sincronização pausada.', msg);
                  set({ isSyncing: false });
                  scheduleSyncRetry('TRANSIENT_NETWORK', () => {
                    get().attemptBackgroundSync();
                  });
                  return;
                }
                
                const errorDetails = {
                  message: e?.message || String(e || ''),
                  code: e?.code || null,
                  details: e?.details || null,
                  hint: e?.hint || null,
                  status: e?.status || null,
                };

                // Se for um erro persistente (banco de dados, violação de regras de plano, etc.),
                // removemos da fila de sincronização para evitar travamento infinito da fila.
                console.warn(
                  `[Sync] Erro persistente no item ${item.id} (${item.type}). Removendo da fila. Detalhes:`,
                  JSON.stringify(errorDetails, null, 2)
                );

                // Se a criação do cliente falhou permanentemente,
                // limpa todos os itens dependentes que usam o ID temporário deste cliente.
                let dependentIdsToRemove: string[] = [];
                if (item.type === 'create_customer') {
                  const tempId = item.payload?.id;
                  if (tempId && isTempCustomerId(tempId)) {
                    const dependents = get().syncQueue.filter((q) => {
                      if (q.id === item.id) return false;
                      const qCustId = String(
                        q.payload?.customer_id || q.payload?.customerId || q.payload?.client_id || q.payload?.clientId || ''
                      );
                      if (qCustId === tempId) return true;
                      if (q.type === 'update_customer' && String(q.payload?.id) === tempId) return true;
                      if (q.type === 'delete_customer' && String(q.payload?.id) === tempId) return true;
                      return false;
                    });

                    for (const dep of dependents) {
                      dependentIdsToRemove.push(dep.id);
                    }
                  }
                }

                set((state) => {
                  const depFailedItems = state.syncQueue
                    .filter((q) => dependentIdsToRemove.includes(q.id))
                    .map((q) => ({
                      ...q,
                      failed_reason: `PARENT_CUSTOMER_CREATION_FAILED (Parent error: ${msg})`,
                      failed_at: new Date().toISOString(),
                      error_details: errorDetails,
                    }));

                  return {
                    failedSyncItems: [
                      ...state.failedSyncItems,
                      {
                        ...(item as any),
                        failed_reason: msg,
                        failed_at: new Date().toISOString(),
                        error_details: errorDetails,
                      },
                      ...depFailedItems,
                    ].slice(-50),
                  };
                });

                processedIds.push(item.id);
                if (dependentIdsToRemove.length > 0) {
                  processedIds.push(...dependentIdsToRemove);
                  remainingQueue = remainingQueue.filter(q => !dependentIdsToRemove.includes(q.id));
                }
                success = true; // Para sair do while e avançar para o próximo item!
              }
            }
          }

          set((state) => ({
            syncQueue: state.syncQueue.filter(q => !processedIds.includes(q.id)),
            isSyncing: false
          }));

          // Any successful batch run means connectivity/auth is OK again; reset retry backoff.
          resetSyncRetryBackoff();
          
          if (processedIds.length > 0) {
            console.log(`[Sync] Lote finalizado. ${processedIds.length} itens sincronizados.`);
          }
        } catch (globalError) {
          console.error('[Sync] Falha crítica no processamento em lote', globalError);
          set({ isSyncing: false });
        }
      },

      loadSupabaseData: async () => {
        try {
          const serverCustomers = await getCustomersWithTransactions();
          const localCustomers = get().customers;

          if (!serverCustomers || serverCustomers.length === 0) {
             const tempCustomers = localCustomers.filter(c => isTempCustomerId(c.id));
             set({ customers: tempCustomers });
             return;
          }
          
          const mappedCustomers: CustomerClient[] = [];
          for (const sc of serverCustomers) {
            const txs = (sc as any).customer_transactions;
            const serverHistory: HistoryItem[] = (txs || []).map((t: any) => ({
               id: t.id,
               description: t.description || '',
               amount: t.amount,
               created_at: t.transaction_date || t.created_at,
               type: (t.type || t.transaction_type) as 'debt' | 'payment' | 'system',
               created_by: t.created_by_name || 'Dono',
            }));

            const pendingTxItems = get().syncQueue.filter(q => 
              (q.type === 'debt' || q.type === 'payment') && 
              String(q.payload?.customer_id || q.payload?.customerId || q.payload?.client_id || q.payload?.clientId || '') === sc.id
            );

            const pendingHistory: HistoryItem[] = pendingTxItems.map(q => ({
              id: q.payload?.local_id || q.id,
              description: q.payload?.description || (q.type === 'payment' ? 'Pagamento Recebido' : 'Compra adicionada'),
              amount: Number(q.payload?.amount || 0),
              created_at: q.added_at || new Date().toISOString(),
              type: q.type as 'debt' | 'payment',
              created_by: 'Dono',
            }));

            const combinedHistory = [...serverHistory];
            for (const ph of pendingHistory) {
              if (!combinedHistory.some(ch => ch.id === ph.id)) {
                combinedHistory.push(ph);
              }
            }
            
            let total_debt_calc = 0;
            combinedHistory.forEach(h => {
              if (h.type === 'debt') total_debt_calc += h.amount;
              if (h.type === 'payment') total_debt_calc -= h.amount;
            });
            total_debt_calc = Number(Math.max(0, total_debt_calc).toFixed(2));
            
            const parsedCep = (sc as any).cep || (sc.address && sc.address.includes(' • CEP: ') ? sc.address.split(' • CEP: ')[1] : '') || '';
            const parsedAddress = (sc as any).address && !(sc as any).address.includes(' • CEP: ') ? (sc as any).address : (sc.address ? sc.address.split(' • CEP: ')[0] : '') || '';

            let parsedDocType: 'cpf' | 'cnpj' | undefined = (sc as any).document_type || undefined;
            let parsedDocValue = (sc as any).document_value || '';
            if (!parsedDocType && !parsedDocValue && sc.notes && sc.notes.startsWith('Documento (')) {
              const match = sc.notes.match(/^Documento \((CPF|CNPJ)\):\s*(.+)$/i);
              if (match) {
                parsedDocType = match[1].toLowerCase() as 'cpf' | 'cnpj';
                parsedDocValue = match[2];
              }
            }

            mappedCustomers.push({
               id: sc.id,
               business_id: sc.business_id,
               name: sc.name || (sc as any).full_name || '',
               full_name: sc.name || (sc as any).full_name || '',
               phone: sc.phone || '',
               whatsapp: sc.phone || '',
               total_debt: total_debt_calc,
               created_at: sc.created_at,
               history: combinedHistory,
               cep: parsedCep || undefined,
               address: parsedAddress || undefined,
               documentType: parsedDocType,
               documentValue: parsedDocValue || undefined,
               picture: undefined,
               picture_storage_path: sc.picture_storage_path || null,
               picture_mime_type: sc.picture_mime_type || null,
            });
          }
          
          const tempCustomers = localCustomers.filter(c => isTempCustomerId(c.id));
          
          set({ customers: [...mappedCustomers, ...tempCustomers] });
          await get().refreshCustomerPictureUrls();
        } catch (error) {
          console.error('[loadSupabaseData] Erro ao carregar do Supabase:', error);
        }
      },

      resetDemoData: () => {
        set({
          customers: [],
          quickItems: [],
          syncQueue: [],
          failedSyncItems: [],
          customerIdMap: {},
          currentBusinessId: undefined,
          hasBootstrappedProfile: false,
        });
      },
    }),
    {
      name: 'fiado-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: async (persistedState, _version) => {
        // Old builds persisted `user`. Never hydrate auth from disk.
        if (persistedState && typeof persistedState === 'object') {
          const state: any = { ...(persistedState as any) };
          delete state.user;
          delete state.authChecked;
          return state;
        }
        return persistedState as any;
      },
      // Always derive auth from Supabase session (never from local persisted state).
      partialize: (state) => {
        const { user: _user, authChecked: _authChecked, ...rest } = state;
        return rest;
      },
    }
  )
);
