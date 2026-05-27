import {
  supabase,
  bootstrapOwnerProfile,
  updateCustomer,
  deleteCustomer as apiDeleteCustomer,
  deleteTransaction as apiDeleteTransaction,
} from '@controle-fiado/api';
import { isTempCustomerId, isTransientNetworkError, localId } from '../utils';
import { PendingQueueItem, CustomerClient, HistoryItem } from '../../types';
import { LocalDatabase } from '../database/LocalDatabase';
import { syncLocalDatabaseCustomers, syncLocalDatabaseQueue } from '../database/sync-local-db';
import { EncryptedStorage } from '../security/encrypted-storage';

const SYNC_RETRY_BASE_MS = 15_000;
const SYNC_RETRY_MAX_MS = 5 * 60_000;
let syncRetryTimer: ReturnType<typeof setTimeout> | null = null;
let syncRetryDelayMs = SYNC_RETRY_BASE_MS;

function scheduleSyncRetry(reason: string, retryFn: () => void) {
  try {
    if (syncRetryTimer) clearTimeout(syncRetryTimer);
  } catch {}

  const delay = Math.min(syncRetryDelayMs, SYNC_RETRY_MAX_MS);
  if (__DEV__) console.log(`[Sync] Agendando retentativa em ${Math.round(delay / 1000)}s. reason=${reason}`);
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

function safePayloadKeys(payload: any): string[] {
  try {
    return Object.keys(payload || {}).sort();
  } catch {
    return [];
  }
}

function normalizeCustomerForSupabase(input: any): {
  name: string | null;
  full_name: string | null;
} {
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

function isEmoji(str?: string) {
  if (!str) return false;
  const s = String(str).trim();
  try {
    const emojiRegex = /^[\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200d\u{1F3FB}-\u{1F3FF}]+$/u;
    return emojiRegex.test(s) && s.length <= 12;
  } catch {
    return s.length <= 4 && !s.includes('/') && !s.startsWith('data:');
  }
}

async function signedUrlForCustomerPicture(path: string) {
  const { data, error } = await supabase.storage.from('customer-pictures').createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function backupOfflineUserData(getState: () => any) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId || userId === 'usr_offline') return;
  try {
    const { customers, syncQueue, failedSyncItems, customerIdMap } = state;
    if (customers.length > 0 || syncQueue.length > 0) {
      const dataToSave = {
        customers,
        syncQueue,
        failedSyncItems,
        customerIdMap,
        savedAt: new Date().toISOString(),
      };
      const storageKey = `fiado_offline_data_${userId}`;
      await EncryptedStorage.setItem(storageKey, JSON.stringify(dataToSave));
      console.log(`[Backup] Dados locais do usuário ${userId} salvos em backup offline.`);
    }
  } catch (err) {
    console.warn('[Backup] Falha ao criar backup offline dos dados do usuário:', err);
  }
}

export async function restoreOfflineUserData(getState: () => any, set: (fn: any) => void, userId?: string) {
  const state = getState();
  const activeUserId = userId || state.user?.id;
  if (!activeUserId || activeUserId === 'usr_offline') return;
  try {
    const storageKey = `fiado_offline_data_${activeUserId}`;
    const raw = await EncryptedStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) {
        console.log(`[Restore] Restaurando dados offline para o usuário ${activeUserId}...`);
        
        const currentStore = getState();
        
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

        void syncLocalDatabaseCustomers(mergedCustomers);
        void syncLocalDatabaseQueue(mergedQueue);

        await EncryptedStorage.removeItem(storageKey);
        console.log(`[Restore] Dados restaurados com sucesso. Fila de sync: ${mergedQueue.length} itens.`);
        
        if (mergedQueue.length > 0) {
          currentStore.attemptBackgroundSync();
        }
      }
    }
  } catch (err) {
    console.warn('[Restore] Falha ao restaurar backup offline dos dados:', err);
  }
}

export async function attemptBackgroundSync(getState: () => any, set: (fn: any) => void) {
  const { syncQueue, isSyncing, businessConfig, user } = getState();
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
      getState().attemptBackgroundSync();
    });
    return;
  }

  if (!sessionData?.session) {
    console.log('[Sync] Usuário não autenticado. Sincronização pausada.');
    set({ isSyncing: false });
    return;
  }

  let bizId = null;
  try {
    const { data, error } = await supabase.rpc('get_current_business_id');
    if (error) throw error;
    bizId = data;
    if (bizId) set({ currentBusinessId: String(bizId) });
  } catch (e: any) {
    const msg = e?.message || String(e || '');
    if (msg.includes('JWT') || msg.includes('authenticated') || msg.includes('auth')) {
      console.log('[Sync] Falha de autenticação ao buscar business_id. Tentando refresh...');
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session) {
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
    console.log('[Sync] business_id ausente. Sincronização pausada.');
    set({ isSyncing: false });
    return;
  }

  console.log(`[Sync] Iniciando sincronização em lote de ${syncQueue.length} itens...`);
  
  let remainingQueue = [...syncQueue].sort((a, b) => {
    const weight = (t: PendingQueueItem['type']) =>
      t === 'create_customer' || t === 'update_customer' ? 0 : 1;
    return weight(a.type) - weight(b.type);
  });
  const processedIds: string[] = [];

  try {
    for (const item of remainingQueue) {
      let success = false;
      let retriesLeft = 1;

      while (!success && retriesLeft >= 0) {
        try {
          if (item.type === 'create_customer') {
            const oldId = String(item.payload.id || '');
            const cep = String(item.payload.cep || '').trim();
            const address = String(item.payload.address || '').trim();
            const docType = String(item.payload.documentType || '').trim();
            const docValue = String(item.payload.documentValue || '').trim();
            const normalized = normalizeCustomerForSupabase(item.payload);
            if (!normalized.full_name) {
              set((state: any) => ({
                failedSyncItems: [
                  ...state.failedSyncItems,
                  { ...(item as any), failed_reason: 'MISSING_NAME', failed_at: new Date().toISOString() },
                ].slice(-50),
              }));
              processedIds.push(item.id);
              success = true;
              break;
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

            if (oldId && isTempCustomerId(oldId) && created?.id) {
              const realBizId = (created as any).business_id;
              set((state: any) => ({
                currentBusinessId: realBizId || state.currentBusinessId,
                customerIdMap: { ...state.customerIdMap, [oldId]: String(created.id) },
                customers: state.customers.map((c: any) =>
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
                    : c
                ),
                syncQueue: state.syncQueue.map((q: any) => {
                  if (q.payload?.customer_id === oldId) return { ...q, payload: { ...q.payload, customer_id: String(created.id) } };
                  if (q.payload?.customerId === oldId) return { ...q, payload: { ...q.payload, customerId: String(created.id) } };
                  if (q.payload?.client_id === oldId) return { ...q, payload: { ...q.payload, client_id: String(created.id) } };
                  if (q.payload?.clientId === oldId) return { ...q, payload: { ...q.payload, clientId: String(created.id) } };
                  if (q.type === 'update_customer' && q.payload?.id === oldId) return { ...q, payload: { ...q.payload, id: String(created.id) } };
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
            const resolvedId = getState().customerIdMap[customerId] || customerId;
            if (isTempCustomerId(resolvedId)) {
              console.log(`[Sync] Update cliente pendente aguardando mapeamento. item=${item.id}`);
            } else {
              const normalized = normalizeCustomerForSupabase(item.payload);
              if (!normalized.full_name) {
                set((state: any) => ({
                  failedSyncItems: [
                    ...state.failedSyncItems,
                    { ...(item as any), failed_reason: 'MISSING_NAME', failed_at: new Date().toISOString() },
                  ].slice(-50),
                }));
                processedIds.push(item.id);
                success = true;
                break;
              }

              let picture_storage_path = item.payload.picture_storage_path;
              let picture_mime_type = item.payload.picture_mime_type;

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
                set((state: any) => ({
                  customers: state.customers.map((c: any) =>
                    c.id === resolvedId ? { ...c, picture: '', picture_storage_path: null, picture_mime_type: null } : c
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
                      if (!isTransientNetworkError(e)) {
                        set((state: any) => ({
                          customers: state.customers.map((c: any) =>
                            c.id === resolvedId ? { ...c, picture: undefined, picture_storage_path: null, picture_mime_type: null } : c
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
                    set((state: any) => ({
                      customers: state.customers.map((c: any) =>
                        c.id === resolvedId
                          ? {
                              ...c,
                              picture: url || c.picture,
                              picture_storage_path: String(picture_storage_path),
                              picture_mime_type: picture_mime_type ?? null,
                              picture_updated_at: new Date().toISOString(),
                            }
                          : c
                      ),
                    }));
                  } catch {}
                }
                success = true;
              }
            }
          } else if (item.type === 'debt' || item.type === 'payment') {
            const rawCustomerId = String(
              item.payload.customer_id || item.payload.customerId || item.payload.client_id || item.payload.clientId || ''
            );
            const resolvedCustomerId = getState().customerIdMap[rawCustomerId] || rawCustomerId;
            if (!resolvedCustomerId || isTempCustomerId(resolvedCustomerId)) {
              const existsLocally = getState().customers.some((c: any) => c.id === rawCustomerId);
              if (!existsLocally) {
                set((state: any) => ({
                  failedSyncItems: [
                    ...state.failedSyncItems,
                    { ...(item as any), failed_reason: 'ORPHAN_TRANSACTION_CUSTOMER', failed_at: new Date().toISOString() },
                  ].slice(-50),
                }));
                processedIds.push(item.id);
                success = true;
                break;
              }
            } else {
              const amount = Number(item.payload.amount || 0);
              const description = String(item.payload.description || '');
              let txError = null;
              let createdTx = null;

              const { data, error } = await supabase.rpc('create_customer_transaction_secure', {
                p_customer_id: resolvedCustomerId,
                p_amount: amount,
                p_description: description,
                p_transaction_type: item.type,
              });
              txError = error;
              createdTx = data;

              if (txError) {
                const { data: retryData, error: retryErr } = await supabase.rpc('create_customer_transaction_secure', {
                  p_customer_id: resolvedCustomerId,
                  p_amount: amount,
                  p_description: description,
                  p_type: item.type,
                });
                if (retryErr) throw retryErr;
                createdTx = retryData;
              }

              const localTxId = item.payload.local_id;
              if (localTxId && createdTx?.id) {
                set((state: any) => ({
                  customers: state.customers.map((c: any) => {
                    if (c.id === resolvedCustomerId) {
                      return {
                        ...c,
                        history: c.history.map((h: any) =>
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
            retriesLeft--;
            try {
              const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
              if (!refreshErr && refreshData?.session) {
                continue;
              }
            } catch {}
          }

          if (String(msg).includes('NOT_AUTHENTICATED')) {
            set({ isSyncing: false });
            return;
          }
          if (String(msg).includes('BUSINESS_CONTEXT_MISSING')) {
            set({ isSyncing: false });
            return;
          }
          if (isTransientNetworkError(e)) {
            set({ isSyncing: false });
            void LocalDatabase.getInstance().incrementOperationRetries(item.id, msg);
            scheduleSyncRetry('TRANSIENT_NETWORK', () => {
              getState().attemptBackgroundSync();
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

          console.warn(`[Sync] Erro persistente no item ${item.id} (${item.type}). Removendo da fila.`, errorDetails);

          // CASCADING FAILURE CORRECTION FOR DEPT QUEUE ITEMS (Bug #1 Fix)
          let dependentIdsToRemove: string[] = [];
          if (item.type === 'create_customer') {
            const tempId = item.payload?.id;
            if (tempId && isTempCustomerId(tempId)) {
              const dependents = getState().syncQueue.filter((q: any) => {
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

          set((state: any) => {
            const depFailedItems = state.syncQueue
              .filter((q: any) => dependentIdsToRemove.includes(q.id))
              .map((q: any) => ({
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
          success = true;
        }
      }
      if (success && !processedIds.includes(item.id)) {
        processedIds.push(item.id);
      }
    }

    set((state: any) => ({
      syncQueue: state.syncQueue.filter((q: any) => !processedIds.includes(q.id)),
      isSyncing: false,
    }));

    for (const id of processedIds) {
      void LocalDatabase.getInstance().markOperationSynced(id);
    }

    resetSyncRetryBackoff();
    if (processedIds.length > 0) {
      console.log(`[Sync] Lote finalizado. ${processedIds.length} itens processados.`);
    }
  } catch (globalError) {
    console.error('[Sync] Falha crítica no processamento em lote', globalError);
    set({ isSyncing: false });
  }
}
