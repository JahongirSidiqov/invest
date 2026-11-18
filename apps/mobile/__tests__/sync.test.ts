import { describe, expect, it } from '@jest/globals';
import {
  lww,
  type SyncCategory,
  type SyncRequest,
  type SyncResponse,
  type SyncTransaction,
} from '@invest/shared';
import { randomUUID } from 'expo-crypto';
import { MemoryRecordStore } from '../src/records/memory-store';
import { runSync } from '../src/records/sync-engine';

/** A tiny in-memory server with the same rules as apps/api SyncService. */
class FakeServer {
  version = 0;
  rows = new Map<string, { t: SyncTransaction; version: number }>();
  cats = new Map<string, { c: SyncCategory; version: number }>();
  calls = 0;
  failNext = false;

  push = async (req: SyncRequest): Promise<SyncResponse> => {
    this.calls++;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('network down');
    }
    for (const c of req.categories ?? []) {
      const existing = this.cats.get(c.clientId);
      if (lww(c.clientUpdatedAt, existing?.c.clientUpdatedAt ?? null) !== 'ignore') {
        this.cats.set(c.clientId, { c, version: ++this.version });
      }
    }
    const rejected: SyncResponse['rejected'] = [];
    const accepted: string[] = [];
    for (const t of req.transactions ?? []) {
      if (t.note === 'REJECT') {
        rejected.push({ entity: 'transaction', clientId: t.clientId, code: 'unknown_category' });
        continue;
      }
      const existing = this.rows.get(t.clientId);
      if (lww(t.clientUpdatedAt, existing?.t.clientUpdatedAt ?? null) !== 'ignore') {
        this.rows.set(t.clientId, { t, version: ++this.version });
      }
      accepted.push(t.clientId);
    }
    const after = Number(req.cursor ?? 0);
    const changed = [...this.rows.values()]
      .filter((r) => r.version > after)
      .sort((a, b) => a.version - b.version);
    const page = changed.slice(0, 500);
    return {
      cursor: String(page.at(-1)?.version ?? after),
      hasMore: changed.length > 500,
      accepted: {
        categories: (req.categories ?? []).map((c) => c.clientId),
        transactions: accepted,
      },
      rejected,
      changes: { categories: [], transactions: page.map((r) => r.t) },
    };
  };

  /** Simulates an edit made on another device. */
  remoteEdit(t: SyncTransaction) {
    this.rows.set(t.clientId, { t, version: ++this.version });
  }
}

function expense(overrides: Partial<SyncTransaction> = {}): SyncTransaction {
  return {
    clientId: randomUUID(),
    type: 'expense',
    amountMinor: 4_000_000,
    currency: 'UZS',
    category: 'food',
    necessity: 'essential',
    occurredOn: '2026-11-18',
    note: 'Tushlik',
    source: 'manual',
    clientUpdatedAt: '2026-11-18T08:00:00.000Z',
    deleted: false,
    ...overrides,
  };
}

const key = () => randomUUID();

describe('offline sync', () => {
  it('saves offline, then sends everything when the network returns', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    for (let i = 0; i < 3; i++) await store.saveTransaction(expense());
    expect(await store.countPending()).toBe(3);

    server.failNext = true;
    await expect(runSync(store, server.push, key)).rejects.toThrow('network down');
    expect(await store.countPending()).toBe(3); // nothing lost

    const result = await runSync(store, server.push, key);
    expect(result.pushed).toBe(3);
    expect(await store.countPending()).toBe(0);
    expect(server.rows.size).toBe(3);
  });

  it('does not duplicate when the same records are sent twice', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    const t = expense();
    await store.saveTransaction(t);
    await runSync(store, server.push, key);
    await store.saveTransaction(t); // e.g. response lost, record still pending
    await runSync(store, server.push, key);
    expect(server.rows.size).toBe(1);
  });

  it('keeps a local edit made while a push was in flight', async () => {
    const store = new MemoryRecordStore();
    const t = expense();
    await store.saveTransaction(t);
    const edited = { ...t, amountMinor: 9_900_000, clientUpdatedAt: '2026-11-18T09:00:00.000Z' };
    const server = new FakeServer();
    const slowPush = async (req: SyncRequest) => {
      await store.saveTransaction(edited); // user edits during the request
      return server.push(req);
    };
    await runSync(store, slowPush, key);
    const local = await store.getTransaction(t.clientId);
    expect(local?.amountMinor).toBe(9_900_000);
    expect(local?.syncStatus).toBe('pending');
  });

  it('pulls edits made on another device, but never over newer local work', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    const a = expense();
    const b = expense();
    await store.saveTransaction(a);
    await store.saveTransaction(b);
    await runSync(store, server.push, key);

    server.remoteEdit({
      ...a,
      amountMinor: 1_000_000,
      clientUpdatedAt: '2026-11-18T10:00:00.000Z',
    });
    server.remoteEdit({
      ...b,
      amountMinor: 2_000_000,
      clientUpdatedAt: '2026-11-18T09:00:00.000Z',
    });
    // Local, unsent edit of b that is newer than the remote one.
    await store.saveTransaction({
      ...b,
      amountMinor: 3_000_000,
      clientUpdatedAt: '2026-11-18T11:00:00.000Z',
    });

    await runSync(store, server.push, key);
    expect((await store.getTransaction(a.clientId))?.amountMinor).toBe(1_000_000);
    expect((await store.getTransaction(b.clientId))?.amountMinor).toBe(3_000_000);
    expect(server.rows.get(b.clientId)?.t.amountMinor).toBe(3_000_000);
  });

  it('marks rejected records instead of retrying them forever', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    const bad = expense({ note: 'REJECT' });
    await store.saveTransaction(bad);
    const result = await runSync(store, server.push, key);
    expect(result.rejected).toBe(1);
    expect((await store.getTransaction(bad.clientId))?.syncStatus).toBe('rejected');
    expect(await store.countPending()).toBe(0);
  });

  it('drains more than one batch', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    for (let i = 0; i < 1201; i++) await store.saveTransaction(expense({ amountMinor: 100 + i }));
    const result = await runSync(store, server.push, key);
    expect(result.pushed).toBe(1201);
    expect(server.calls).toBeGreaterThanOrEqual(3);
    expect(await store.countPending()).toBe(0);
  });

  it('hides deleted records from the list', async () => {
    const store = new MemoryRecordStore();
    const t = expense();
    await store.saveTransaction(t);
    await store.saveTransaction({
      ...t,
      deleted: true,
      clientUpdatedAt: '2026-11-18T09:00:00.000Z',
    });
    expect(await store.listTransactions()).toEqual([]);
    expect(await store.listTransactions({ includeDeleted: true })).toHaveLength(1);
  });
});
