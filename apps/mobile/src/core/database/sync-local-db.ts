import { LocalDatabase } from './LocalDatabase';
import { PendingQueueItem } from '../../types';

/** Keeps LocalDatabase pending_operations in sync with the Zustand syncQueue. */
export async function syncLocalDatabaseQueue(syncQueue: PendingQueueItem[]): Promise<void> {
  const db = LocalDatabase.getInstance();
  const ops = syncQueue.map((item) => ({
    ...item,
    retries: 0,
    synced: false,
  }));
  await db.savePendingOperations(ops);
}

export async function syncLocalDatabaseCustomers(customers: Parameters<typeof LocalDatabase.prototype.saveCustomers>[0]): Promise<void> {
  await LocalDatabase.getInstance().saveCustomers(customers);
}
