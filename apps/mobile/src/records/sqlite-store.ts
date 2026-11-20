import {
  emptyChanges,
  SYNC_ENTITIES,
  type SyncChanges,
  type SyncEntity,
  type SyncRecordMap,
} from '@invest/shared';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { secure } from '../state/secure';
import {
  type Local,
  type LocalTransaction,
  type RecordStore,
  remoteWins,
  type SyncedRef,
  type TransactionFilter,
} from './store';

const DB_NAME = 'records.db';

/**
 * One table for every syncable entity: the record is stored as JSON, with the
 * columns sync and history queries need pulled out next to it.
 */
const MIGRATIONS = [
  `CREATE TABLE records (
     entity TEXT NOT NULL,
     client_id TEXT NOT NULL,
     data TEXT NOT NULL,
     client_updated_at TEXT NOT NULL,
     deleted INTEGER NOT NULL DEFAULT 0,
     sync_status TEXT NOT NULL,
     reject_code TEXT,
     occurred_on TEXT,
     type TEXT,
     PRIMARY KEY (entity, client_id)
   );
   CREATE INDEX records_status ON records (sync_status);
   CREATE INDEX records_history ON records (entity, occurred_on DESC, client_updated_at DESC);
   CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
];

type Row = {
  entity: string;
  data: string;
  sync_status: string;
  reject_code: string | null;
};

function fromRow<E extends SyncEntity>(row: Row): Local<E> {
  return {
    ...(JSON.parse(row.data) as SyncRecordMap[E]),
    syncStatus: row.sync_status as Local<E>['syncStatus'],
    rejectCode: row.reject_code,
  };
}

/** Hex key for SQLCipher, created once per install and kept in the OS keystore. */
async function databaseKey(): Promise<string> {
  const existing = await secure.get('dbKey');
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await secure.set('dbKey', key);
  return key;
}

/**
 * Opens the encrypted database. SQLCipher needs a development or release build;
 * Expo Go has no SQLCipher, so the key pragma is ignored there. Release builds refuse
 * to run without encryption (brief §3.11).
 */
export async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const key = await databaseKey();
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
  if (!cipher?.cipher_version && !__DEV__) {
    throw new Error('Local database is not encrypted; SQLCipher is required');
  }
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const version =
    (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'))?.user_version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(MIGRATIONS[i]!);
      await tx.execAsync(`PRAGMA user_version = ${i + 1};`);
    });
  }
  return db;
}

export async function deleteLocalDatabase(): Promise<void> {
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);
  await secure.remove('dbKey');
}

export class SqliteRecordStore implements RecordStore {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  private async upsert(entity: SyncEntity, record: SyncRecordMap[SyncEntity], status: string) {
    const t = entity === 'transaction' ? (record as SyncRecordMap['transaction']) : null;
    await this.db.runAsync(
      `INSERT INTO records (entity, client_id, data, client_updated_at, deleted, sync_status,
         reject_code, occurred_on, type)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT (entity, client_id) DO UPDATE SET data = excluded.data,
         client_updated_at = excluded.client_updated_at, deleted = excluded.deleted,
         sync_status = excluded.sync_status, reject_code = NULL,
         occurred_on = excluded.occurred_on, type = excluded.type`,
      entity,
      record.clientId,
      JSON.stringify(record),
      record.clientUpdatedAt,
      record.deleted ? 1 : 0,
      status,
      t?.occurredOn ?? null,
      t?.type ?? null,
    );
  }

  save<E extends SyncEntity>(entity: E, record: SyncRecordMap[E]) {
    return this.upsert(entity, record, 'pending');
  }

  async get<E extends SyncEntity>(entity: E, clientId: string) {
    const row = await this.db.getFirstAsync<Row>(
      'SELECT * FROM records WHERE entity = ? AND client_id = ?',
      entity,
      clientId,
    );
    return row ? fromRow<E>(row) : null;
  }

  async list<E extends SyncEntity>(entity: E) {
    const rows = await this.db.getAllAsync<Row>(
      'SELECT * FROM records WHERE entity = ? AND deleted = 0',
      entity,
    );
    return rows.map((r) => fromRow<E>(r));
  }

  async listTransactions(filter: TransactionFilter = {}): Promise<LocalTransaction[]> {
    const where = ["entity = 'transaction'"];
    const params: (string | number)[] = [];
    if (!filter.includeDeleted) where.push('deleted = 0');
    if (filter.type) {
      where.push('type = ?');
      params.push(filter.type);
    }
    if (filter.from) {
      where.push('occurred_on >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('occurred_on <= ?');
      params.push(filter.to);
    }
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM records WHERE ${where.join(' AND ')}
       ORDER BY occurred_on DESC, client_updated_at DESC LIMIT ?`,
      ...params,
      filter.limit ?? -1,
    );
    return rows.map((r) => fromRow<'transaction'>(r));
  }

  async pending(limit: number): Promise<SyncChanges> {
    const out = emptyChanges();
    const rows = await this.db.getAllAsync<Row>(
      "SELECT * FROM records WHERE sync_status = 'pending' LIMIT ?",
      limit,
    );
    // Dependency order (categories and assets first) is applied by the server.
    for (const row of rows) {
      const { syncStatus: _s, rejectCode: _r, ...record } = fromRow(row);
      (out[row.entity as SyncEntity] as unknown[]).push(record);
    }
    return out;
  }

  async markSynced(entity: SyncEntity, refs: SyncedRef[]) {
    await this.db.withTransactionAsync(async () => {
      for (const ref of refs) {
        await this.db.runAsync(
          `UPDATE records SET sync_status = 'synced', reject_code = NULL
           WHERE entity = ? AND client_id = ? AND client_updated_at = ?`,
          entity,
          ref.clientId,
          ref.clientUpdatedAt,
        );
      }
    });
  }

  async markRejected(entity: SyncEntity, clientId: string, code: string) {
    await this.db.runAsync(
      "UPDATE records SET sync_status = 'rejected', reject_code = ? WHERE entity = ? AND client_id = ?",
      code,
      entity,
      clientId,
    );
  }

  async applyRemote(changes: Partial<SyncChanges>) {
    await this.db.withTransactionAsync(async () => {
      for (const entity of SYNC_ENTITIES) {
        for (const record of changes[entity] ?? []) {
          const local = await this.get(entity, record.clientId);
          if (remoteWins(local, record)) await this.upsert(entity, record, 'synced');
        }
      }
    });
  }

  async getMeta(key: string) {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?',
      key,
    );
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    await this.db.runAsync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }

  async countPending() {
    const row = await this.db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM records WHERE sync_status = 'pending'",
    );
    return row?.n ?? 0;
  }

  async clear() {
    await this.db.execAsync('DELETE FROM records; DELETE FROM meta;');
  }
}
