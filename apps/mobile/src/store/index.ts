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
  getCustomers,
  getTransactionsByCustomer,
} from '@controle-fiado/api';
import * as Haptics from 'expo-haptics';
import { INITIAL_CUSTOMERS, INITIAL_QUICK_ITEMS } from '../constants';

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
  full_name: string;
  phone: string;
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
}

export interface FiadoMobileState {
  // Auth State
  user: { email?: string; id?: string; full_name?: string; picture?: string; avatar_url?: string } | null;
  businessConfig: {
    businessName: string;
    pixKey: string;
    phone: string;
  };
  setUser: (user: any) => void;
  updateBusinessConfig: (config: Partial<FiadoMobileState['businessConfig']>) => void;

  // Subscription State
  subscription: UserSubscriptionState;
  fetchSubscription: () => Promise<void>;
  toggleSubscriptionSimulation: (enabled: boolean, planId?: 'free' | 'premium_monthly') => void;
  simulateSubscriptionUpgrade: (method: 'pix' | 'card') => void;
  simulateSubscriptionDowngrade: () => void;
  getActiveCustomersCount: () => number;
  getCurrentMonthTransactionsCount: () => number;

  // Customers Cache
  customers: CustomerClient[];
  quickItems: QuickItemClient[];
  syncQueue: PendingQueueItem[];
  failedSyncItems: Array<PendingQueueItem & { failed_reason: string; failed_at: string }>;
  customerIdMap: Record<string, string>;
  isSyncing: boolean;

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
  enqueueSync: (type: PendingQueueItem['type'], payload: any) => void;
  attemptBackgroundSync: () => Promise<void>;
  clearSyncQueue: () => void;
  resetDemoData: () => void;
  loadSupabaseData: () => Promise<void>;
}

function normalizeCustomerForSupabase(input: any): {
  name: string | null;
  full_name: string | null;
} {
  const raw =
    input?.full_name ??
    input?.name ??
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

function isTempCustomerId(val: string) {
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
  const s = String(str);
  return s.length <= 4 && !s.includes('/') && !s.startsWith('data:');
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
    (set, get) => ({
      user: null,
      businessConfig: {
        businessName: 'Meu Mercadinho',
        pixKey: 'mercadinho@bairro.com.br',
        phone: '11999999999',
      },
      setUser: (user) => {
        set({ user });
        if (user) {
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
            }
          });
        }
      },
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
                status: 'active',
                current_period_end: null,
                is_simulated: false,
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
            }
          });
        } else {
          set((state) => ({
            subscription: {
              ...state.subscription,
              is_simulated: false,
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
          }
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
            if (h.type === 'debt' || h.type === 'payment' || h.type === 'system') {
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
          const updates: Array<{ id: string; url: string }> = [];
          for (const c of list) {
            if (isEmoji(c.picture)) continue;
            const path = String(c.picture_storage_path || '').trim();
            if (!path) continue;
            const url = await signedUrlForCustomerPicture(path);
            if (url) updates.push({ id: c.id, url });
          }
          if (updates.length === 0) return;

          set((state) => ({
            customers: state.customers.map((c) => {
              const u = updates.find((x) => x.id === c.id);
              return u ? { ...c, picture: u.url } : c;
            }),
          }));
        } catch {
          // ignore
        }
      },

      addCustomer: (name, phone = '', cep = '', address = '', documentType, documentValue = '', picture = '') => {
        const sub = get().subscription;
        if (!sub.is_premium && sub.max_customers !== null) {
          const activeCount = get().getActiveCustomersCount();
          if (activeCount >= sub.max_customers) {
            throw new Error('FREE_PLAN_CUSTOMER_LIMIT_REACHED');
          }
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const newCust: CustomerClient = {
          id: 'cust_' + Date.now(),
          business_id: 'biz_production_br_01',
          full_name: name.trim(),
          phone: cleanPhone,
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
                  id: 'hist_' + Date.now(),
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
            ...(cust.picture === '' ? { clear_photo: true } : {}),
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
                id: 'hist_' + Date.now(),
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

        const methodLabel = method === 'PIX' ? 'Pagamento PIX' : method === 'cartao' ? 'Pagamento Cartão' : 'Pagamento Dinheiro';
        let localTxId = '';
        set((state) => {
          const updated = state.customers.map((c) => {
            if (c.id === customerId) {
              const newItem: HistoryItem = {
                id: 'hist_' + Date.now(),
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
                id: 'hist_' + Date.now(),
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
                id: 'hist_' + Date.now(),
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
          id: 'sync_' + Date.now(),
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

      attemptBackgroundSync: async () => {
        const { syncQueue, isSyncing, businessConfig, user } = get();
        if (isSyncing || syncQueue.length === 0) return;

        let sessionData = null;
        try {
          const { data } = await supabase.auth.getSession();
          sessionData = data;
        } catch (e) {
          console.log('[Sync] Banco offline ou erro de rede. Sincronização pausada.');
          set({ isSyncing: false });
          return;
        }

        if (!sessionData?.session) {
          console.log('[Sync] Usuário não autenticado. Sincronização pausada.');
          set({ isSyncing: false });
          return;
        }

        // Garante que existe um profile/business associado ao usuário antes de usar RPCs que dependem de business_id.
        // (Sem isso, get_current_business_id() pode retornar null e quebrar inserts.)
        try {
          const phone = (businessConfig.phone || '').replace(/\D/g, '');
          if (phone) {
            await bootstrapOwnerProfile({
              business_name: businessConfig.businessName || 'Meu Estabelecimento',
              owner_name: user?.full_name || 'Dono',
              phone,
            });
          }
        } catch (e: any) {
          console.log('[Sync] Falha ao inicializar perfil/loja:', e?.message || e);
        }

        try {
          const { data: bizId } = await supabase.rpc('get_current_business_id');
          if (!bizId) {
            console.log('[Sync] business_id ausente. Configure o telefone da loja em Config e tente novamente.');
            set({ isSyncing: false });
            return;
          }
        } catch (e: any) {
          console.log('[Sync] Não foi possível validar business_id:', e?.message || e);
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
                    ],
                    syncQueue: state.syncQueue.filter((q) => q.id !== item.id),
                  }));
                  continue;
                }

                const addressLine = [address, cep ? `CEP: ${cep}` : null].filter(Boolean).join(' • ') || null;
                const notesLine = docValue ? `Documento (${(docType || 'doc').toUpperCase()}): ${docValue}` : null;

                const { data: created, error: createErr } = await supabase.rpc('create_customer_secure', {
                  p_name: normalized.full_name,
                  p_phone: item.payload.phone || '',
                  p_email: item.payload.email || null,
                  p_address: addressLine,
                  p_notes: notesLine,
                  p_credit_limit: 0,
                  p_picture_storage_path: item.payload.picture_storage_path || null,
                  p_picture_mime_type: item.payload.picture_mime_type || null,
                });
                if (createErr) throw createErr;

                // Substitui ID local temporário pelo UUID real e reescreve itens pendentes que referenciam o ID antigo.
                if (oldId && isTempCustomerId(oldId) && created?.id) {
                  set((state) => ({
                    customerIdMap: { ...state.customerIdMap, [oldId]: String(created.id) },
	                    customers: state.customers.map((c) =>
	                      c.id === oldId
	                        ? {
	                            ...c,
	                            id: String(created.id),
	                            business_id: (created as any).business_id || c.business_id,
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
                      ],
                      syncQueue: state.syncQueue.filter((q) => q.id !== item.id),
                    }));
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
                          const blob = await resp.blob();
                          const { error: upErr } = await supabase.storage
                            .from('customer-pictures')
                            .upload(path, blob as any, { contentType: mime, upsert: true } as any);
                          if (upErr) throw upErr;
                          picture_storage_path = path;
                          picture_mime_type = mime;
                        } catch (e: any) {
                          console.log(
                            `[Sync] Falha upload foto cliente. item=${item.id} customerId=${resolvedId} payloadKeys=${safePayloadKeys(item.payload).join(',')}`,
                          );
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
                      ],
                      syncQueue: state.syncQueue.filter((q) => q.id !== item.id),
                    }));
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
              
              if (success) processedIds.push(item.id);
            } catch (e: any) {
              const msg = e?.message || String(e || '');
              if (String(msg).includes('NOT_AUTHENTICATED')) {
                console.log('[Sync] Sessão expirou. Sincronização pausada.');
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
                return;
              }
              
              // Se for um erro persistente (banco de dados, violação de regras de plano, etc.),
              // removemos da fila de sincronização para evitar travamento infinito da fila.
              console.warn(
                `[Sync] Erro persistente no item ${item.id} (${item.type}). Removendo da fila. Erro:`,
                msg
              );
              set((state) => ({
                failedSyncItems: [
                  ...state.failedSyncItems,
                  { ...(item as any), failed_reason: msg, failed_at: new Date().toISOString() },
                ],
              }));
              processedIds.push(item.id);
            }
          }

          set((state) => ({
            syncQueue: state.syncQueue.filter(q => !processedIds.includes(q.id)),
            isSyncing: false
          }));
          
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
          const serverCustomers = await getCustomers();
          if (!serverCustomers || serverCustomers.length === 0) {
             set({ customers: [] });
             return;
          }
          
          const mappedCustomers: CustomerClient[] = [];
          for (const sc of serverCustomers) {
            const txs = await getTransactionsByCustomer(sc.id);
            const history: HistoryItem[] = (txs || []).map((t: any) => ({
               id: t.id,
               description: t.description || '',
               amount: t.amount,
               created_at: t.created_at,
               type: t.type as 'debt' | 'payment' | 'system',
               created_by: t.created_by_name || 'Dono',
            }));
            
            mappedCustomers.push({
               id: sc.id,
               business_id: sc.business_id,
               full_name: sc.name || '',
               phone: sc.phone || '',
               total_debt: sc.total_debt || 0,
               created_at: sc.created_at,
               history,
               cep: undefined,
               address: sc.address || undefined,
               documentType: undefined,
               documentValue: undefined,
               picture: undefined,
               picture_storage_path: sc.picture_storage_path || null,
               picture_mime_type: sc.picture_mime_type || null,
            });
          }
          
          set({ customers: mappedCustomers });
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
        });
      },
    })
);
