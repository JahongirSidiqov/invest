import type {
  SyncChanges,
  SyncEntity,
  SyncRecordMap,
  SyncTransaction,
  TransactionType,
} from '@invest/shared';

export type SyncStatus = 'pending' | 'synced' | 'rejected';

export type Local<E extends SyncEntity> = SyncRecordMap[E] & {
  syncStatus: SyncStatus;
  rejectCode: string | null;
};

export type LocalTransaction = Local<'transaction'>;
export type LocalCategory = Local<'category'>;

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
 * Local record storage for every syncable entity. The app uses the encrypted SQLite
 * implementation; tests use the in-memory one. Both behave the same.
 */
export interface RecordStore {
  save<E extends SyncEntity>(entity: E, record: SyncRecordMap[E]): Promise<void>;
  get<E extends SyncEntity>(entity: E, clientId: string): Promise<Local<E> | null>;
  /** Live (not deleted) records of one entity. */
  list<E extends SyncEntity>(entity: E): Promise<Local<E>[]>;
  listTransactions(filter?: TransactionFilter): Promise<LocalTransaction[]>;

  pending(limit: number): Promise<SyncChanges>;
  /** Marks rows synced only if they were not edited again after the push started. */
  markSynced(entity: SyncEntity, refs: SyncedRef[]): Promise<void>;
  markRejected(entity: SyncEntity, clientId: string, code: string): Promise<void>;
  applyRemote(changes: Partial<SyncChanges>): Promise<void>;

  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
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

export function sortNewestFirst(a: SyncTransaction, b: SyncTransaction): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
  return a.clientUpdatedAt < b.clientUpdatedAt ? 1 : -1;
}

export function matchesFilter(t: SyncTransaction, filter: TransactionFilter): boolean {
  if (!filter.includeDeleted && t.deleted) return false;
  if (filter.type && t.type !== filter.type) return false;
  if (filter.from && t.occurredOn < filter.from) return false;
  if (filter.to && t.occurredOn > filter.to) return false;
  return true;
}
