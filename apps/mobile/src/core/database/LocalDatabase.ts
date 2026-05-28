import { CustomerClient, HistoryItem, PendingQueueItem } from '../../types';
import { EncryptedStorage } from '../security/encrypted-storage';

export interface PendingOperation extends PendingQueueItem {
  retries: number;
  synced: boolean;
  failed_reason?: string;
  failed_at?: string;
}

const CUSTOMERS_TABLE_KEY = 'sqlite_mock_customers';
const PENDING_OPERATIONS_KEY = 'sqlite_mock_pending_operations';

export class LocalDatabase {
  private static instance: LocalDatabase;

  private constructor() {}

  public static getInstance(): LocalDatabase {
    if (!LocalDatabase.instance) {
      LocalDatabase.instance = new LocalDatabase();
    }
    return LocalDatabase.instance;
  }

  // --- Customers Table ---
  
  public async getCustomers(): Promise<CustomerClient[]> {
    try {
      const data = await EncryptedStorage.getItem(CUSTOMERS_TABLE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[LocalDB] Failed to load customers:', e);
      return [];
    }
  }

  public async saveCustomers(customers: CustomerClient[]): Promise<void> {
    try {
      await EncryptedStorage.setItem(CUSTOMERS_TABLE_KEY, JSON.stringify(customers));
    } catch (e) {
      console.error('[LocalDB] Failed to save customers:', e);
    }
  }

  public async insertCustomer(customer: CustomerClient): Promise<void> {
    const list = await this.getCustomers();
    // Conflict resolution: latest write wins or prevent duplicate
    const index = list.findIndex(c => c.id === customer.id);
    if (index !== -1) {
      list[index] = { ...list[index], ...customer };
    } else {
      list.unshift(customer);
    }
    await this.saveCustomers(list);
  }

  public async updateCustomer(id: string, updates: Partial<CustomerClient>): Promise<void> {
    const list = await this.getCustomers();
    const index = list.findIndex(c => c.id === id);
    if (index !== -1) {
      list[index] = {
        ...list[index],
        ...updates,
        // Conflict resolution strategy: updated_at timestamp
        created_at: list[index].created_at || new Date().toISOString(),
      };
      await this.saveCustomers(list);
    }
  }

  public async deleteCustomer(id: string): Promise<void> {
    const list = await this.getCustomers();
    const filtered = list.filter(c => c.id !== id);
    await this.saveCustomers(filtered);
  }

  // --- Transactions ---

  public async addTransaction(customerId: string, tx: HistoryItem): Promise<void> {
    const list = await this.getCustomers();
    const index = list.findIndex(c => c.id === customerId);
    if (index !== -1) {
      const history = list[index].history || [];
      if (!history.some(h => h.id === tx.id)) {
        history.unshift(tx);
        list[index].history = history;
        
        // Recalculate debt
        let debts = 0;
        let payments = 0;
        history.forEach(h => {
          if (h.type === 'debt') debts += h.amount;
          if (h.type === 'payment') payments += h.amount;
        });
        list[index].total_debt = Number(Math.max(0, debts - payments).toFixed(2));
        
        await this.saveCustomers(list);
      }
    }
  }

  public async updateTransaction(customerId: string, txId: string, updates: Partial<HistoryItem>): Promise<void> {
    const list = await this.getCustomers();
    const index = list.findIndex(c => c.id === customerId);
    if (index !== -1) {
      const history = list[index].history || [];
      const txIndex = history.findIndex(h => h.id === txId);
      if (txIndex !== -1) {
        history[txIndex] = { ...history[txIndex], ...updates };
        list[index].history = history;

        let debts = 0;
        let payments = 0;
        history.forEach(h => {
          if (h.type === 'debt') debts += h.amount;
          if (h.type === 'payment') payments += h.amount;
        });
        list[index].total_debt = Number(Math.max(0, debts - payments).toFixed(2));

        await this.saveCustomers(list);
      }
    }
  }

  public async deleteTransaction(customerId: string, txId: string): Promise<void> {
    const list = await this.getCustomers();
    const index = list.findIndex(c => c.id === customerId);
    if (index !== -1) {
      const history = list[index].history || [];
      const filtered = history.filter(h => h.id !== txId);
      list[index].history = filtered;

      let debts = 0;
      let payments = 0;
      filtered.forEach(h => {
        if (h.type === 'debt') debts += h.amount;
        if (h.type === 'payment') payments += h.amount;
      });
      list[index].total_debt = Number(Math.max(0, debts - payments).toFixed(2));

      await this.saveCustomers(list);
    }
  }

  // --- Sync Queue Table (`pending_operations`) ---

  public async getPendingOperations(): Promise<PendingOperation[]> {
    try {
      const data = await EncryptedStorage.getItem(PENDING_OPERATIONS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[LocalDB] Failed to load operation queue:', e);
      return [];
    }
  }

  public async savePendingOperations(ops: PendingOperation[]): Promise<void> {
    try {
      await EncryptedStorage.setItem(PENDING_OPERATIONS_KEY, JSON.stringify(ops));
    } catch (e) {
      console.error('[LocalDB] Failed to save operation queue:', e);
    }
  }

  public async enqueueOperation(type: PendingQueueItem['type'], payload: any, customId?: string): Promise<PendingOperation> {
    const ops = await this.getPendingOperations();
    const newOp: PendingOperation = {
      id: customId || `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      added_at: new Date().toISOString(),
      retries: 0,
      synced: false,
    };
    ops.push(newOp);
    await this.savePendingOperations(ops);
    return newOp;
  }

  public async markOperationSynced(id: string): Promise<void> {
    const ops = await this.getPendingOperations();
    const filtered = ops.filter(o => o.id !== id);
    await this.savePendingOperations(filtered);
  }

  public async incrementOperationRetries(id: string, reason: string): Promise<void> {
    const ops = await this.getPendingOperations();
    const index = ops.findIndex(o => o.id === id);
    if (index !== -1) {
      ops[index].retries += 1;
      ops[index].failed_reason = reason;
      ops[index].failed_at = new Date().toISOString();
      await this.savePendingOperations(ops);
    }
  }

  public async clearPendingOperations(): Promise<void> {
    await EncryptedStorage.removeItem(PENDING_OPERATIONS_KEY);
  }

  // --- Reconciliation & Conflict Resolution ---

  /**
   * Latest Write Wins resolution on full customer sync
   */
  public async reconcileCustomer(serverCust: any): Promise<void> {
    const list = await this.getCustomers();
    const index = list.findIndex(c => c.id === serverCust.id);
    if (index !== -1) {
      const local = list[index];
      // Compare modified time if available, or assume latest write wins
      const localTime = new Date(local.created_at || 0).getTime();
      const serverTime = new Date(serverCust.created_at || serverCust.updated_at || 0).getTime();
      
      if (serverTime >= localTime) {
        // Server is newer or equal, apply server values but keep any pending changes locally
        list[index] = {
          ...local,
          ...serverCust,
          // Re-calculate totals/history merged if required
        };
        await this.saveCustomers(list);
      }
    } else {
      list.unshift(serverCust);
      await this.saveCustomers(list);
    }
  }
}
