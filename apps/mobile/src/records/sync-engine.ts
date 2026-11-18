import { SYNC_MAX_BATCH, type SyncRequest, type SyncResponse } from '@invest/shared';
import type { RecordStore } from './store';

export type PushFn = (request: SyncRequest, idempotencyKey: string) => Promise<SyncResponse>;

export interface SyncResult {
  pushed: number;
  pulled: number;
  rejected: number;
}

/** Hard stop so a server bug cannot keep the phone looping. */
const MAX_ROUNDS = 50;

/**
 * Pushes pending local changes and pulls server changes until both are drained.
 * Safe to run at any time: records carry client ids and timestamps, so a retry after
 * a lost response neither duplicates nor overwrites newer local edits.
 */
export async function runSync(
  store: RecordStore,
  push: PushFn,
  newKey: () => string,
): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, rejected: 0 };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const pending = await store.pending(SYNC_MAX_BATCH);
    const cursor = await store.getCursor();
    const response = await push(
      { cursor, categories: pending.categories, transactions: pending.transactions },
      newKey(),
    );

    const pushedAt = new Map(
      [...pending.categories, ...pending.transactions].map((r) => [r.clientId, r.clientUpdatedAt]),
    );
    const refs = (ids: string[]) =>
      ids.flatMap((clientId) => {
        const clientUpdatedAt = pushedAt.get(clientId);
        return clientUpdatedAt ? [{ clientId, clientUpdatedAt }] : [];
      });

    await store.markSynced('category', refs(response.accepted.categories));
    await store.markSynced('transaction', refs(response.accepted.transactions));
    for (const r of response.rejected) {
      await store.markRejected(r.entity, r.clientId, r.code);
    }
    await store.applyRemote(response.changes);
    await store.setCursor(response.cursor);

    result.pushed += response.accepted.categories.length + response.accepted.transactions.length;
    result.pulled += response.changes.categories.length + response.changes.transactions.length;
    result.rejected += response.rejected.length;

    const morePending = pending.categories.length + pending.transactions.length === SYNC_MAX_BATCH;
    if (!response.hasMore && !morePending) break;
  }
  return result;
}
