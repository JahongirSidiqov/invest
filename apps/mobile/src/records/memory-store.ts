import type { SyncCategory, SyncTransaction } from '@invest/shared';
import {
  type LocalCategory,
  type LocalTransaction,
  type RecordStore,
  remoteWins,
  type SyncedRef,
  sortNewestFirst,
  type TransactionFilter,
} from './store';

/** In-memory RecordStore for tests. */
export class MemoryRecordStore implements RecordStore {
  private transactions = new Map<string, LocalTransaction>();
  private categories = new Map<string, LocalCategory>();
  private cursor: string | null = null;

  async saveTransaction(t: SyncTransaction) {
    this.transactions.set(t.clientId, { ...t, syncStatus: 'pending', rejectCode: null });
  }

  async getTransaction(clientId: string) {
    return this.transactions.get(clientId) ?? null;
  }

  async listTransactions(filter: TransactionFilter = {}) {
    return [...this.transactions.values()]
      .filter((t) => filter.includeDeleted || !t.deleted)
      .filter((t) => !filter.type || t.type === filter.type)
      .filter((t) => !filter.from || t.occurredOn >= filter.from)
      .filter((t) => !filter.to || t.occurredOn <= filter.to)
      .sort(sortNewestFirst)
      .slice(0, filter.limit ?? Infinity);
  }

  async saveCategory(c: SyncCategory) {
    this.categories.set(c.clientId, { ...c, syncStatus: 'pending', rejectCode: null });
  }

  async listCategories() {
    return [...this.categories.values()].filter((c) => !c.deleted);
  }

  async pending(limit: number) {
    const strip = <T extends { syncStatus: unknown; rejectCode: unknown }>({
      syncStatus: _s,
      rejectCode: _r,
      ...rest
    }: T) => rest;
    const categories = [...this.categories.values()]
      .filter((c) => c.syncStatus === 'pending')
      .slice(0, limit)
      .map(strip);
    const transactions = [...this.transactions.values()]
      .filter((t) => t.syncStatus === 'pending')
      .slice(0, limit - categories.length)
      .map(strip);
    return { categories, transactions };
  }

  async markSynced(entity: 'category' | 'transaction', refs: SyncedRef[]) {
    const map = entity === 'category' ? this.categories : this.transactions;
    for (const ref of refs) {
      const row = map.get(ref.clientId);
      if (row && row.clientUpdatedAt === ref.clientUpdatedAt) {
        map.set(ref.clientId, { ...row, syncStatus: 'synced', rejectCode: null } as never);
      }
    }
  }

  async markRejected(entity: 'category' | 'transaction', clientId: string, code: string) {
    const map = entity === 'category' ? this.categories : this.transactions;
    const row = map.get(clientId);
    if (row) map.set(clientId, { ...row, syncStatus: 'rejected', rejectCode: code } as never);
  }

  async applyRemote(changes: { categories: SyncCategory[]; transactions: SyncTransaction[] }) {
    for (const c of changes.categories) {
      if (remoteWins(this.categories.get(c.clientId) ?? null, c)) {
        this.categories.set(c.clientId, { ...c, syncStatus: 'synced', rejectCode: null });
      }
    }
    for (const t of changes.transactions) {
      if (remoteWins(this.transactions.get(t.clientId) ?? null, t)) {
        this.transactions.set(t.clientId, { ...t, syncStatus: 'synced', rejectCode: null });
      }
    }
  }

  async getCursor() {
    return this.cursor;
  }

  async setCursor(cursor: string) {
    this.cursor = cursor;
  }

  async countPending() {
    return (
      [...this.transactions.values()].filter((t) => t.syncStatus === 'pending').length +
      [...this.categories.values()].filter((c) => c.syncStatus === 'pending').length
    );
  }

  async clear() {
    this.transactions.clear();
    this.categories.clear();
    this.cursor = null;
  }
}
