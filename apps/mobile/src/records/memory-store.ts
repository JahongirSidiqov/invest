import {
  emptyChanges,
  SYNC_ENTITIES,
  type SyncChanges,
  type SyncEntity,
  type SyncRecordMap,
} from '@invest/shared';
import {
  type Local,
  type LocalTransaction,
  matchesFilter,
  type RecordStore,
  remoteWins,
  type SyncedRef,
  sortNewestFirst,
  type TransactionFilter,
} from './store';

type Row = Local<SyncEntity>;

/** In-memory RecordStore for tests. */
export class MemoryRecordStore implements RecordStore {
  private rows = new Map<SyncEntity, Map<string, Row>>(
    SYNC_ENTITIES.map((e) => [e, new Map<string, Row>()]),
  );
  private meta = new Map<string, string>();

  private table(entity: SyncEntity): Map<string, Row> {
    return this.rows.get(entity)!;
  }

  async save<E extends SyncEntity>(entity: E, record: SyncRecordMap[E]) {
    this.table(entity).set(record.clientId, { ...record, syncStatus: 'pending', rejectCode: null });
  }

  async get<E extends SyncEntity>(entity: E, clientId: string) {
    return (this.table(entity).get(clientId) as Local<E> | undefined) ?? null;
  }

  async list<E extends SyncEntity>(entity: E) {
    return [...this.table(entity).values()].filter((r) => !r.deleted) as unknown as Local<E>[];
  }

  async listTransactions(filter: TransactionFilter = {}) {
    return ([...this.table('transaction').values()] as LocalTransaction[])
      .filter((t) => matchesFilter(t, filter))
      .sort(sortNewestFirst)
      .slice(0, filter.limit ?? Infinity);
  }

  async pending(limit: number) {
    const out = emptyChanges();
    let left = limit;
    for (const entity of SYNC_ENTITIES) {
      for (const row of this.table(entity).values()) {
        if (left === 0) break;
        if (row.syncStatus !== 'pending') continue;
        const { syncStatus: _s, rejectCode: _r, ...record } = row;
        (out[entity] as unknown[]).push(record);
        left--;
      }
    }
    return out;
  }

  async markSynced(entity: SyncEntity, refs: SyncedRef[]) {
    const table = this.table(entity);
    for (const ref of refs) {
      const row = table.get(ref.clientId);
      if (row && row.clientUpdatedAt === ref.clientUpdatedAt) {
        table.set(ref.clientId, { ...row, syncStatus: 'synced', rejectCode: null });
      }
    }
  }

  async markRejected(entity: SyncEntity, clientId: string, code: string) {
    const row = this.table(entity).get(clientId);
    if (row) this.table(entity).set(clientId, { ...row, syncStatus: 'rejected', rejectCode: code });
  }

  async applyRemote(changes: Partial<SyncChanges>) {
    for (const entity of SYNC_ENTITIES) {
      for (const record of changes[entity] ?? []) {
        const table = this.table(entity);
        if (remoteWins(table.get(record.clientId) ?? null, record)) {
          table.set(record.clientId, { ...record, syncStatus: 'synced', rejectCode: null });
        }
      }
    }
  }

  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }

  async countPending() {
    let n = 0;
    for (const table of this.rows.values()) {
      for (const row of table.values()) if (row.syncStatus === 'pending') n++;
    }
    return n;
  }

  async clear() {
    for (const table of this.rows.values()) table.clear();
    this.meta.clear();
  }
}
