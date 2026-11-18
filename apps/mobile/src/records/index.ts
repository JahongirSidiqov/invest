import type { SyncRequest, SyncResponse, SyncTransaction } from '@invest/shared';
import * as Crypto from 'expo-crypto';
import { api, refreshSession } from '../api';
import { deleteLocalDatabase, openEncryptedDatabase, SqliteRecordStore } from './sqlite-store';
import type { RecordStore } from './store';
import { runSync, type SyncResult } from './sync-engine';

let storePromise: Promise<RecordStore> | null = null;

/** Opens the encrypted store once per app session. */
export function getStore(): Promise<RecordStore> {
  storePromise ??= openEncryptedDatabase().then((db) => new SqliteRecordStore(db));
  return storePromise;
}

/** Called on sign-out: local records belong to the signed-in user only. */
export async function resetLocalRecords(): Promise<void> {
  storePromise = null;
  await deleteLocalDatabase();
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onRecordsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const l of listeners) l();
}

export function newClientId(): string {
  return Crypto.randomUUID();
}

/** Saves locally first (works offline), then asks for a background sync. */
export async function saveTransaction(t: SyncTransaction): Promise<void> {
  const store = await getStore();
  await store.saveTransaction(t);
  notify();
  requestSync();
}

export async function deleteTransaction(t: SyncTransaction): Promise<void> {
  await saveTransaction({ ...t, deleted: true, clientUpdatedAt: new Date().toISOString() });
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function push(request: SyncRequest, idempotencyKey: string): Promise<SyncResponse> {
  const call = () =>
    api.POST('/v1/sync', {
      body: request as never,
      params: { header: { 'Idempotency-Key': idempotencyKey } },
    });
  let { data, response } = await call();
  if (response.status === 401 && (await refreshSession())) {
    ({ data, response } = await call());
  }
  if (!data) throw new HttpError(response.status);
  return data as SyncResponse;
}

let running: Promise<SyncResult | null> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

/** Single-flight sync with exponential backoff (2 s … 5 min) after failures. */
export function syncNow(): Promise<SyncResult | null> {
  running ??= (async () => {
    try {
      const store = await getStore();
      const result = await runSync(store, push, newClientId);
      failures = 0;
      if (result.pulled > 0 || result.pushed > 0 || result.rejected > 0) notify();
      return result;
    } catch {
      failures++;
      schedule(Math.min(2000 * 2 ** failures, 5 * 60 * 1000));
      return null;
    } finally {
      running = null;
    }
  })();
  return running;
}

function schedule(delayMs: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delayMs);
}

/** Debounced: many quick entries become one request. */
export function requestSync(): void {
  schedule(1000);
}

export async function pendingCount(): Promise<number> {
  return (await getStore()).countPending();
}
