import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  supabase,
  getCustomersWithTransactions,
} from '@controle-fiado/api';
import * as Haptics from 'expo-haptics';

import {
  localId,
  isTempCustomerId,
  isEmoji,
} from '../core/utils';
import { LocalDatabase } from '../core/database/LocalDatabase';
import { syncLocalDatabaseCustomers, syncLocalDatabaseQueue } from '../core/database/sync-local-db';
import {
  backupOfflineUserData,
  restoreOfflineUserData,
  attemptBackgroundSync,
} from '../core/sync/SyncEngine';
import {
  CustomerClient,
  HistoryItem,
  PendingQueueItem,
  QuickItemClient,
  UserSubscriptionState,
} from '../types';

export { isTempCustomerId } from '../core/utils';
export {
  CustomerClient,
  HistoryItem,
  PendingQueueItem,
  QuickItemClient,
  UserSubscriptionState,
} from '../types';

// Signed URL Cache Magic Numbers (Warning #12 Fix)
export const PICTURE_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PICTURE_URL_REFRESH_THRESHOLD_MS = (PICTURE_URL_TTL_SECONDS - 60 * 60 * 24) * 1000; // 6 days

// Fallback Portuguese suggestions list (Warning #15 Fix)
export const FALLBACK_QUICK_ITEMS: QuickItemClient[] = [
  { name: 'Pão', price: 5, count: 1, lastUsed: new Date().toISOString() },
  { name: 'Coca-cola', price: 8, count: 1, lastUsed: new Date().toISOString() },
  { name: 'Cerveja', price: 6, count: 1, lastUsed: new Date().toISOString() },
  { name: 'Salgado', price: 7, count: 1, lastUsed: new Date().toISOString() },
  { name: 'Doces', price: 3, count: 1, lastUsed: new Date().toISOString() },
];

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

  // App Lock State
  isSystemLockEnabled: boolean;
  setIsSystemLockEnabled: (enabled: boolean) => void;
  isBiometricsEnabled: boolean;
  setIsBiometricsEnabled: (enabled: boolean) => void;
  autoLockTimeout: number;
  setAutoLockTimeout: (timeout: number) => void;
  lastActiveTimestamp: number;
  setLastActiveTimestamp: (timestamp: number) => void;

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
  backupOfflineUserData: () => Promise<void>;
  restoreOfflineUserData: (userId: string) => Promise<void>;
  resetDemoData: () => void;
  loadSupabaseData: () => Promise<void>;
}

async function signedUrlForCustomerPicture(path: string) {
  const { data, error } = await supabase.storage.from('customer-pictures').createSignedUrl(path, PICTURE_URL_TTL_SECONDS);
  if (error) throw error;
  return data?.signedUrl || null;
}

function isLikelyLocalImageUri(val?: string) {
  if (!val) return false;
  const s = String(val);
  return s.startsWith('file:') || s.startsWith('content:') || s.startsWith('ph:') || s.startsWith('assets-library:');
}

function mimeFromUri(uri?: string) {
  const u = String(uri || '').toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
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
      isSystemLockEnabled: false,
      isBiometricsEnabled: false,
      autoLockTimeout: 0,
      lastActiveTimestamp: 0,
      currentBusinessId: null,
      setUser: (user) => {
        set({ user });
        if (user) {
          get().fetchSubscription();
          // Clear hardcoded demo values on login to prevent leakage
          const current = get().businessConfig;
          if (current.businessName === 'Meu Mercadinho' && current.pixKey === 'mercadinho@bairro.com.br') {
            set({
              businessConfig: {
                businessName: '',
                pixKey: '',
                phone: '',
              }
            });
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
            },
            // Reset to default demo values on logout
            businessConfig: {
              businessName: 'Meu Mercadinho',
              pixKey: 'mercadinho@bairro.com.br',
              phone: '11999999999',
            }
          });
        }
      },
      setAuthChecked: (checked) => set({ authChecked: checked }),
      updateBusinessConfig: (config) =>
        set((state) => ({
          businessConfig: { ...state.businessConfig, ...config },
        })),
      setIsSystemLockEnabled: (enabled) => set({ isSystemLockEnabled: enabled }),
      setIsBiometricsEnabled: (enabled) => set({ isBiometricsEnabled: enabled }),
      setAutoLockTimeout: (timeout) => set({ autoLockTimeout: timeout }),
      setLastActiveTimestamp: (timestamp) => set({ lastActiveTimestamp: timestamp }),

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

            if (c.picture && c.picture_updated_at) {
              const ageMs = Date.now() - new Date(c.picture_updated_at).getTime();
              if (ageMs < PICTURE_URL_REFRESH_THRESHOLD_MS) {
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

          // Parallel URL resolution to prevent blocking sequential waits (Bug #13 fix)
          const results = await Promise.allSettled(promises);
          const updates: { id: string; url: string }[] = [];
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              updates.push(r.value);
            }
          }

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

        void LocalDatabase.getInstance().insertCustomer(newCust);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        get().enqueueSync('create_customer', {
          ...newCust,
          name: newCust.full_name,
          full_name: newCust.full_name,
          customerName: newCust.full_name,
          customer_name: newCust.full_name,
        });

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
              const auditLog = {
                id: localId('hist'),
                description: 'Perfil Atualizado',
                amount: 0,
                created_at: new Date().toISOString(),
                type: 'system' as const,
                created_by: state.user?.full_name || 'Dono',
              };
              const fullHistory = [auditLog, ...c.history];
              let systemCount = 0;
              const prunedHistory = fullHistory.filter((h) => {
                if (h.type === 'system') {
                  systemCount++;
                  return systemCount <= 20;
                }
                return true;
              });
              const updatedCust = {
                ...c,
                full_name: name.trim() || c.full_name,
                phone: cleanPhone,
                whatsapp: cleanPhone,
                cep: cep !== undefined ? cep : c.cep,
                address: address !== undefined ? address : c.address,
                documentType: documentType !== undefined ? documentType : c.documentType,
                documentValue: documentValue !== undefined ? documentValue : c.documentValue,
                picture: picture !== undefined ? picture : c.picture,
                history: prunedHistory,
              };
              void LocalDatabase.getInstance().updateCustomer(id, updatedCust);
              return updatedCust;
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
            if (item.type === 'create_customer' && item.payload.id === id) return false;
            if (item.type === 'update_customer' && item.payload.id === id) return false;
            const payloadCustId = item.payload.customer_id || item.payload.customerId || item.payload.client_id || item.payload.clientId;
            if (payloadCustId === id) return false;
            return true;
          }),
        }));

        void LocalDatabase.getInstance().deleteCustomer(id);

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

        const localTxId = localId('hist');
        const newHistoryItem: HistoryItem = {
          id: localTxId,
          description: description.trim() || 'Fiado',
          amount,
          created_at: new Date().toISOString(),
          type: 'debt',
          created_by: get().user?.full_name || 'Dono',
        };

        set((state) => {
          const updated = state.customers.map((c) => {
            if (c.id === customerId) {
              const newHistory: HistoryItem[] = [
                newHistoryItem,
                ...c.history,
              ];
              const total_debt = Number((c.total_debt + amount).toFixed(2));
              return { ...c, total_debt, history: newHistory };
            }
            return c;
          });
          return { customers: updated };
        });

        void LocalDatabase.getInstance().addTransaction(customerId, newHistoryItem);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        get().enqueueSync('debt', { customer_id: customerId, amount, description, local_id: localTxId });
      },

      receivePayment: (customerId, amount, method = 'Dinheiro') => {
        const sub = get().subscription;
        if (!sub.is_premium && sub.max_transactions_per_month !== null) {
          const txCount = get().getCurrentMonthTransactionsCount();
          if (txCount >= sub.max_transactions_per_month) {
            throw new Error('FREE_PLAN_TRANSACTION_LIMIT_REACHED');
          }
        }

        const localTxId = localId('hist');
        const methodLabel = method ? `Pago via ${method}` : 'Pagamento';
        const newHistoryItem: HistoryItem = {
          id: localTxId,
          description: methodLabel,
          amount,
          created_at: new Date().toISOString(),
          type: 'payment',
          created_by: get().user?.full_name || 'Dono',
        };

        set((state) => {
          const updated = state.customers.map((c) => {
            if (c.id === customerId) {
              const newHistory: HistoryItem[] = [
                newHistoryItem,
                ...c.history,
              ];
              const total_debt = Number(Math.max(0, c.total_debt - amount).toFixed(2));
              return { ...c, total_debt, history: newHistory };
            }
            return c;
          });
          return { customers: updated };
        });

        void LocalDatabase.getInstance().addTransaction(customerId, newHistoryItem);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        get().enqueueSync('payment', { customer_id: customerId, amount, description: methodLabel, local_id: localTxId });
      },

      editHistoryItem: (customerId, itemId, newDesc, newAmount) => {
        const customer = get().customers.find((c) => c.id === customerId);
        if (!customer) return;
        const originalItem = customer.history.find((h) => h.id === itemId);
        if (!originalItem) return;

        const cleanDesc = newDesc.trim();
        // Skip updating if values are unchanged (Bug #8 Fix)
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

              let debts = 0;
              let pays = 0;
              history.forEach((h) => {
                if (h.type === 'debt') debts += h.amount;
                if (h.type === 'payment') pays += h.amount;
              });
              const total_debt = Number(Math.max(0, debts - pays).toFixed(2));

              const auditLog: HistoryItem = {
                id: localId('hist'),
                description: `Auditoria: Edição do item`,
                amount: 0,
                created_at: new Date().toISOString(),
                type: 'system',
                created_by: state.user?.full_name || 'Dono',
              };

              const fullHistory = [auditLog, ...history];
              let systemCount = 0;
              const prunedHistory = fullHistory.filter((h) => {
                if (h.type === 'system') {
                  systemCount++;
                  return systemCount <= 20;
                }
                return true;
              });

              return { ...c, total_debt, history: prunedHistory };
            }
            return c;
          });
          return { customers: updated };
        });

        void LocalDatabase.getInstance().updateTransaction(customerId, itemId, {
          description: newDesc.trim() || originalItem.description,
          amount: newAmount,
        });

        if (itemId.startsWith('hist_')) {
          // Update the pending sync item in the queue in-place
          let foundPending = false;
          set((state) => {
            const updatedQueue = state.syncQueue.map((q) => {
              if ((q.type === 'debt' || q.type === 'payment') && q.payload?.local_id === itemId) {
                foundPending = true;
                return {
                  ...q,
                  payload: {
                    ...q.payload,
                    amount: newAmount,
                    description: newDesc.trim() || q.payload.description || originalItem.description,
                  },
                };
              }
              return q;
            });
            return { syncQueue: updatedQueue };
          });

          if (foundPending) {
            void syncLocalDatabaseQueue(get().syncQueue);
            get().attemptBackgroundSync();
            return;
          }
        }

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

              const fullHistory = [auditLog, ...history];
              let systemCount = 0;
              const prunedHistory = fullHistory.filter((h) => {
                if (h.type === 'system') {
                  systemCount++;
                  return systemCount <= 20;
                }
                return true;
              });

              return { ...c, total_debt, history: prunedHistory };
            }
            return c;
          });
          return { customers: updated, syncQueue: syncQueueFiltered };
        });

        void LocalDatabase.getInstance().deleteTransaction(customerId, itemId);

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

        if (sorted.length === 0) {
          sorted = FALLBACK_QUICK_ITEMS;
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

        void syncLocalDatabaseQueue(get().syncQueue);
        void LocalDatabase.getInstance().enqueueOperation(type, payload, item.id);
        
        get().attemptBackgroundSync();
      },

      clearSyncQueue: () => {
        set({ syncQueue: [], failedSyncItems: [], customerIdMap: {} });
        void LocalDatabase.getInstance().clearPendingOperations();
      },

      flushSyncQueue: async () => {
        if (get().syncQueue.length === 0) {
          return;
        }

        if (get().isSyncing) {
          console.log('[Sync] Já sincronizando. Aguardando conclusão para logout...');
          let retries = 50;
          while (get().isSyncing && retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            retries--;
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

      backupOfflineUserData: async () => {
        return backupOfflineUserData(get);
      },

      restoreOfflineUserData: async (userId: string) => {
        return restoreOfflineUserData(get, set, userId);
      },

      retryFailedSyncItems: async () => {
        const { failedSyncItems, syncQueue } = get();
        if (failedSyncItems.length === 0) return;

        const restored = failedSyncItems.map((item) => {
          const { failed_reason, failed_at, error_details, ...original } = item as any;
          return original;
        });

        set({
          syncQueue: [...restored, ...syncQueue],
          failedSyncItems: [],
        });

        await get().attemptBackgroundSync();
      },

      attemptBackgroundSync: async () => {
        return attemptBackgroundSync(get, set);
      },

      loadSupabaseData: async () => {
        try {
          // Fetch and update business config from Supabase to prevent demo leak
          try {
            const { data: bizData, error: bizErr } = await supabase
              .from('businesses')
              .select('*')
              .single();
            
            if (!bizErr && bizData) {
              set({
                businessConfig: {
                  businessName: bizData.business_name || '',
                  pixKey: bizData.pix_key || '',
                  phone: bizData.phone || '',
                },
                currentBusinessId: bizData.id || null,
              });
            }
          } catch (bizFetchError) {
            console.warn('[loadSupabaseData] Failed to fetch business config:', bizFetchError);
          }

          const serverCustomers = await getCustomersWithTransactions();
          const localCustomers = get().customers;

          if (!serverCustomers || serverCustomers.length === 0) {
            const hasSyncedLocalCustomers = localCustomers.some((c) => !isTempCustomerId(c.id));
            if (hasSyncedLocalCustomers || get().syncQueue.length > 0) {
              return;
            }
            const tempCustomers = localCustomers.filter((c) => isTempCustomerId(c.id));
            set({ customers: tempCustomers });
            void syncLocalDatabaseCustomers(tempCustomers);
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
          const mergedCustomers = [...mappedCustomers, ...tempCustomers];

          set({ customers: mergedCustomers });
          void syncLocalDatabaseCustomers(mergedCustomers);
          
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
          currentBusinessId: null,
          hasBootstrappedProfile: false,
        });
        void LocalDatabase.getInstance().clearPendingOperations();
        void LocalDatabase.getInstance().saveCustomers([]);
      },
    }),
    {
      name: 'fiado-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: async (persistedState, _version) => {
        if (persistedState && typeof persistedState === 'object') {
          const state: any = { ...(persistedState as any) };
          delete state.user;
          delete state.authChecked;
          return state;
        }
        return persistedState as any;
      },
      partialize: (state) => {
        const { user: _user, authChecked: _authChecked, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        void syncLocalDatabaseCustomers(state.customers);
        void syncLocalDatabaseQueue(state.syncQueue);
      },
    }
  )
);
