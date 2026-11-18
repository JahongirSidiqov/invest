import type { SyncCategory, SyncTransaction, TransactionType } from '@invest/shared';

export type SyncStatus = 'pending' | 'synced' | 'rejected';

export interface LocalTransaction extends SyncTransaction {
  syncStatus: SyncStatus;
  rejectCode: string | null;
}

export interface LocalCategory extends SyncCategory {
  syncStatus: SyncStatus;
  rejectCode: string | null;
}

export interface TransactionFilter {
  type?: TransactionType;
  from?: string;
  to?: string;
  includeDeleted?: boolean;
  limit?: number;
}

export interface SyncedRef {
  clientId: string;
  clientUpdatedAt: string;
}

/**
 * Local record storage. The app uses the encrypted SQLite implementation; tests use
 * the in-memory one. Both must behave identically (see __tests__/store.test.ts).
 */
export interface RecordStore {
  saveTransaction(t: SyncTransaction): Promise<void>;
  getTransaction(clientId: string): Promise<LocalTransaction | null>;
  listTransactions(filter?: TransactionFilter): Promise<LocalTransaction[]>;
  saveCategory(c: SyncCategory): Promise<void>;
  listCategories(): Promise<LocalCategory[]>;

  pending(limit: number): Promise<{ categories: SyncCategory[]; transactions: SyncTransaction[] }>;
  /** Marks rows synced only if they were not edited again after the push started. */
  markSynced(entity: 'category' | 'transaction', refs: SyncedRef[]): Promise<void>;
  markRejected(entity: 'category' | 'transaction', clientId: string, code: string): Promise<void>;
  applyRemote(changes: {
    categories: SyncCategory[];
    transactions: SyncTransaction[];
  }): Promise<void>;

  getCursor(): Promise<string | null>;
  setCursor(cursor: string): Promise<void>;
  countPending(): Promise<number>;
  clear(): Promise<void>;
}

/**
 * Should a row from the server replace the local one? Local pending edits that are
 * newer than the server copy are kept, so offline work is never overwritten.
 */
export function remoteWins(
  local: { syncStatus: SyncStatus; clientUpdatedAt: string } | null,
  remote: { clientUpdatedAt: string },
): boolean {
  if (!local) return true;
  if (local.syncStatus !== 'pending') return true;
  return Date.parse(remote.clientUpdatedAt) >= Date.parse(local.clientUpdatedAt);
}

export function sortNewestFirst(a: LocalTransaction, b: LocalTransaction): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
  return a.clientUpdatedAt < b.clientUpdatedAt ? 1 : -1;
}
