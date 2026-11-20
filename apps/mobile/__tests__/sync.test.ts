import { describe, expect, it } from '@jest/globals';
import {
  emptyChanges,
  lww,
  SYNC_ENTITIES,
  type SyncEntity,
  type SyncRecordMap,
  type SyncRequest,
  type SyncResponse,
  type SyncTransaction,
} from '@invest/shared';
import { randomUUID } from 'expo-crypto';
import { MemoryRecordStore } from '../src/records/memory-store';
import { runSync } from '../src/records/sync-engine';

type AnyRecord = SyncRecordMap[SyncEntity];

/** A tiny in-memory server with the same rules as apps/api SyncService. */
class FakeServer {
  version = 0;
  rows = new Map<string, { entity: SyncEntity; r: AnyRecord; version: number }>();
  calls = 0;
  failNext = false;

  push = async (req: SyncRequest): Promise<SyncResponse> => {
    this.calls++;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('network down');
    }
    const accepted = Object.fromEntries(SYNC_ENTITIES.map((e) => [e, [] as string[]])) as {
      [E in SyncEntity]: string[];
    };
    const rejected: SyncResponse['rejected'] = [];
    for (const entity of SYNC_ENTITIES) {
      for (const r of req.changes[entity] ?? []) {
        if ((r as SyncTransaction).note === 'REJECT') {
          rejected.push({ entity, clientId: r.clientId, code: 'unknown_category' });
          continue;
        }
        const key = `${entity}:${r.clientId}`;
        const existing = this.rows.get(key);
        if (lww(r.clientUpdatedAt, existing?.r.clientUpdatedAt ?? null) !== 'ignore') {
          this.rows.set(key, { entity, r, version: ++this.version });
        }
        accepted[entity].push(r.clientId);
      }
    }
    const after = Number(req.cursor ?? 0);
    const changed = [...this.rows.values()]
      .filter((row) => row.version > after)
      .sort((a, b) => a.version - b.version);
    const page = changed.slice(0, 500);
    const changes = emptyChanges();
    for (const row of page) (changes[row.entity] as AnyRecord[]).push(row.r);
    return {
      cursor: String(page.at(-1)?.version ?? after),
      hasMore: changed.length > 500,
      accepted,
      rejected,
      changes,
    };
  };

  get(clientId: string) {
    return this.rows.get(`transaction:${clientId}`)?.r as SyncTransaction | undefined;
  }

  /** Simulates an edit made on another device. */
  remoteEdit(t: SyncTransaction) {
    this.rows.set(`transaction:${t.clientId}`, {
      entity: 'transaction',
      r: t,
      version: ++this.version,
    });
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
    asset: null,
    capitalised: null,
    occurredOn: '2026-11-18',
    note: 'Tushlik',
    source: 'manual',
    clientUpdatedAt: '2026-11-18T08:00:00.000Z',
    deleted: false,
    ...overrides,
  };
}

const key = () => randomUUID();
const save = (store: MemoryRecordStore, t: SyncTransaction) => store.save('transaction', t);
const get = (store: MemoryRecordStore, id: string) => store.get('transaction', id);

describe('offline sync', () => {
  it('saves offline, then sends everything when the network returns', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    for (let i = 0; i < 3; i++) await save(store, expense());
    expect(await store.countPending()).toBe(3);

    server.failNext = true;
    await expect(runSync(store, server.push, key)).rejects.toThrow('network down');
    expect(await store.countPending()).toBe(3); // nothing lost

    const result = await runSync(store, server.push, key);
    expect(result.pushed).toBe(3);
    expect(await store.countPending()).toBe(0);
    expect(server.rows.size).toBe(3);
  });

  it('syncs every entity type, not only transactions', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    const assetId = randomUUID();
    await store.save('asset', {
      clientId: assetId,
      type: 'iman',
      name: 'Iman',
      liquid: false,
      dividendMethod: 'capitalise',
      openingInvestedMinor: 1_000_000_000,
      openedOn: '2026-01-01',
      note: null,
      clientUpdatedAt: '2026-11-18T08:00:00.000Z',
      deleted: false,
    });
    await save(
      store,
      expense({ type: 'investment', category: null, necessity: null, asset: assetId }),
    );
    const result = await runSync(store, server.push, key);
    expect(result.pushed).toBe(2);
    expect(await store.countPending()).toBe(0);
  });

  it('does not duplicate when the same records are sent twice', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    const t = expense();
    await save(store, t);
    await runSync(store, server.push, key);
    await save(store, t); // e.g. response lost, record still pending
    await runSync(store, server.push, key);
    expect(server.rows.size).toBe(1);
  });

  it('keeps a local edit made while a push was in flight', async () => {
    const store = new MemoryRecordStore();
    const t = expense();
    await save(store, t);
    const edited = { ...t, amountMinor: 9_900_000, clientUpdatedAt: '2026-11-18T09:00:00.000Z' };
    const server = new FakeServer();
    const slowPush = async (req: SyncRequest) => {
      await save(store, edited); // user edits during the request
      return server.push(req);
    };
    await runSync(store, slowPush, key);
    const local = await get(store, t.clientId);
    expect(local?.amountMinor).toBe(9_900_000);
    expect(local?.syncStatus).toBe('pending');
  });

  it('pulls edits made on another device, but never over newer local work', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    const a = expense();
    const b = expense();
    await save(store, a);
    await save(store, b);
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
    await save(store, {
      ...b,
      amountMinor: 3_000_000,
      clientUpdatedAt: '2026-11-18T11:00:00.000Z',
    });

    await runSync(store, server.push, key);
    expect((await get(store, a.clientId))?.amountMinor).toBe(1_000_000);
    expect((await get(store, b.clientId))?.amountMinor).toBe(3_000_000);
    expect(server.get(b.clientId)?.amountMinor).toBe(3_000_000);
  });

  it('marks rejected records instead of retrying them forever', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    const bad = expense({ note: 'REJECT' });
    await save(store, bad);
    const result = await runSync(store, server.push, key);
    expect(result.rejected).toBe(1);
    expect((await get(store, bad.clientId))?.syncStatus).toBe('rejected');
    expect(await store.countPending()).toBe(0);
  });

  it('drains more than one batch', async () => {
    const store = new MemoryRecordStore();
    const server = new FakeServer();
    for (let i = 0; i < 1201; i++) await save(store, expense({ amountMinor: 100 + i }));
    const result = await runSync(store, server.push, key);
    expect(result.pushed).toBe(1201);
    expect(server.calls).toBeGreaterThanOrEqual(3);
    expect(await store.countPending()).toBe(0);
  });

  it('hides deleted records from the list', async () => {
    const store = new MemoryRecordStore();
    const t = expense();
    await save(store, t);
    await save(store, { ...t, deleted: true, clientUpdatedAt: '2026-11-18T09:00:00.000Z' });
    expect(await store.listTransactions()).toEqual([]);
    expect(await store.listTransactions({ includeDeleted: true })).toHaveLength(1);
  });
});
