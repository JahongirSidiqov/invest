import type { SyncCategory, SyncTransaction } from '@invest/shared';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { secure } from '../state/secure';
import {
  type LocalCategory,
  type LocalTransaction,
  type RecordStore,
  remoteWins,
  type SyncedRef,
  type TransactionFilter,
} from './store';

const DB_NAME = 'records.db';

const MIGRATIONS = [
  `CREATE TABLE transactions (
     client_id TEXT PRIMARY KEY NOT NULL,
     type TEXT NOT NULL,
     amount_minor INTEGER NOT NULL,
     currency TEXT NOT NULL,
     category TEXT,
     necessity TEXT,
     occurred_on TEXT NOT NULL,
     note TEXT,
     source TEXT NOT NULL,
     client_updated_at TEXT NOT NULL,
     deleted INTEGER NOT NULL DEFAULT 0,
     sync_status TEXT NOT NULL,
     reject_code TEXT
   );
   CREATE INDEX transactions_occurred ON transactions (occurred_on DESC, client_updated_at DESC);
   CREATE INDEX transactions_status ON transactions (sync_status);
   CREATE TABLE categories (
     client_id TEXT PRIMARY KEY NOT NULL,
     kind TEXT NOT NULL,
     name TEXT NOT NULL,
     necessity TEXT,
     icon TEXT,
     client_updated_at TEXT NOT NULL,
     deleted INTEGER NOT NULL DEFAULT 0,
     sync_status TEXT NOT NULL,
     reject_code TEXT
   );
   CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
];

type TxRow = {
  client_id: string;
  type: string;
  amount_minor: number;
  currency: string;
  category: string | null;
  necessity: string | null;
  occurred_on: string;
  note: string | null;
  source: string;
  client_updated_at: string;
  deleted: number;
  sync_status: string;
  reject_code: string | null;
};

type CatRow = {
  client_id: string;
  kind: string;
  name: string;
  necessity: string | null;
  icon: string | null;
  client_updated_at: string;
  deleted: number;
  sync_status: string;
  reject_code: string | null;
};

function txFromRow(r: TxRow): LocalTransaction {
  return {
    clientId: r.client_id,
    type: r.type as LocalTransaction['type'],
    amountMinor: r.amount_minor,
    currency: r.currency as LocalTransaction['currency'],
    category: r.category,
    necessity: r.necessity as LocalTransaction['necessity'],
    occurredOn: r.occurred_on,
    note: r.note,
    source: r.source as LocalTransaction['source'],
    clientUpdatedAt: r.client_updated_at,
    deleted: r.deleted === 1,
    syncStatus: r.sync_status as LocalTransaction['syncStatus'],
    rejectCode: r.reject_code,
  };
}

function catFromRow(r: CatRow): LocalCategory {
  return {
    clientId: r.client_id,
    kind: r.kind as LocalCategory['kind'],
    name: r.name,
    necessity: r.necessity as LocalCategory['necessity'],
    icon: r.icon,
    clientUpdatedAt: r.client_updated_at,
    deleted: r.deleted === 1,
    syncStatus: r.sync_status as LocalCategory['syncStatus'],
    rejectCode: r.reject_code,
  };
}

function stripTx({ syncStatus: _s, rejectCode: _r, ...t }: LocalTransaction): SyncTransaction {
  return t;
}

function stripCat({ syncStatus: _s, rejectCode: _r, ...c }: LocalCategory): SyncCategory {
  return c;
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
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

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

  private async upsertTx(t: SyncTransaction, status: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO transactions (client_id, type, amount_minor, currency, category, necessity,
         occurred_on, note, source, client_updated_at, deleted, sync_status, reject_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT (client_id) DO UPDATE SET type = excluded.type, amount_minor = excluded.amount_minor,
         currency = excluded.currency, category = excluded.category, necessity = excluded.necessity,
         occurred_on = excluded.occurred_on, note = excluded.note, source = excluded.source,
         client_updated_at = excluded.client_updated_at, deleted = excluded.deleted,
         sync_status = excluded.sync_status, reject_code = NULL`,
      t.clientId,
      t.type,
      t.amountMinor,
      t.currency,
      t.category,
      t.necessity,
      t.occurredOn,
      t.note,
      t.source,
      t.clientUpdatedAt,
      t.deleted ? 1 : 0,
      status,
    );
  }

  private async upsertCat(c: SyncCategory, status: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO categories (client_id, kind, name, necessity, icon, client_updated_at, deleted,
         sync_status, reject_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT (client_id) DO UPDATE SET kind = excluded.kind, name = excluded.name,
         necessity = excluded.necessity, icon = excluded.icon,
         client_updated_at = excluded.client_updated_at, deleted = excluded.deleted,
         sync_status = excluded.sync_status, reject_code = NULL`,
      c.clientId,
      c.kind,
      c.name,
      c.necessity,
      c.icon,
      c.clientUpdatedAt,
      c.deleted ? 1 : 0,
      status,
    );
  }

  saveTransaction(t: SyncTransaction) {
    return this.upsertTx(t, 'pending');
  }

  async getTransaction(clientId: string) {
    const row = await this.db.getFirstAsync<TxRow>(
      'SELECT * FROM transactions WHERE client_id = ?',
      clientId,
    );
    return row ? txFromRow(row) : null;
  }

  async listTransactions(filter: TransactionFilter = {}) {
    const where: string[] = [];
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
    const rows = await this.db.getAllAsync<TxRow>(
      `SELECT * FROM transactions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY occurred_on DESC, client_updated_at DESC LIMIT ?`,
      ...params,
      filter.limit ?? -1,
    );
    return rows.map(txFromRow);
  }

  saveCategory(c: SyncCategory) {
    return this.upsertCat(c, 'pending');
  }

  async listCategories() {
    const rows = await this.db.getAllAsync<CatRow>(
      'SELECT * FROM categories WHERE deleted = 0 ORDER BY name',
    );
    return rows.map(catFromRow);
  }

  async pending(limit: number) {
    const cats = await this.db.getAllAsync<CatRow>(
      "SELECT * FROM categories WHERE sync_status = 'pending' LIMIT ?",
      limit,
    );
    const txs = await this.db.getAllAsync<TxRow>(
      "SELECT * FROM transactions WHERE sync_status = 'pending' LIMIT ?",
      limit - cats.length,
    );
    return {
      categories: cats.map(catFromRow).map(stripCat),
      transactions: txs.map(txFromRow).map(stripTx),
    };
  }

  async markSynced(entity: 'category' | 'transaction', refs: SyncedRef[]) {
    const table = entity === 'category' ? 'categories' : 'transactions';
    await this.db.withTransactionAsync(async () => {
      for (const ref of refs) {
        await this.db.runAsync(
          `UPDATE ${table} SET sync_status = 'synced', reject_code = NULL
           WHERE client_id = ? AND client_updated_at = ?`,
          ref.clientId,
          ref.clientUpdatedAt,
        );
      }
    });
  }

  async markRejected(entity: 'category' | 'transaction', clientId: string, code: string) {
    const table = entity === 'category' ? 'categories' : 'transactions';
    await this.db.runAsync(
      `UPDATE ${table} SET sync_status = 'rejected', reject_code = ? WHERE client_id = ?`,
      code,
      clientId,
    );
  }

  async applyRemote(changes: { categories: SyncCategory[]; transactions: SyncTransaction[] }) {
    await this.db.withTransactionAsync(async () => {
      for (const c of changes.categories) {
        const local = await this.db.getFirstAsync<CatRow>(
          'SELECT * FROM categories WHERE client_id = ?',
          c.clientId,
        );
        if (remoteWins(local ? catFromRow(local) : null, c)) await this.upsertCat(c, 'synced');
      }
      for (const t of changes.transactions) {
        const local = await this.getTransaction(t.clientId);
        if (remoteWins(local, t)) await this.upsertTx(t, 'synced');
      }
    });
  }

  async getCursor() {
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'cursor'",
    );
    return row?.value ?? null;
  }

  async setCursor(cursor: string) {
    await this.db.runAsync(
      "INSERT INTO meta (key, value) VALUES ('cursor', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      cursor,
    );
  }

  async countPending() {
    const row = await this.db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM transactions WHERE sync_status = 'pending')
            + (SELECT COUNT(*) FROM categories WHERE sync_status = 'pending') AS n`,
    );
    return row?.n ?? 0;
  }

  async clear() {
    await this.db.execAsync('DELETE FROM transactions; DELETE FROM categories; DELETE FROM meta;');
  }
}
