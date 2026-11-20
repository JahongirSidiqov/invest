import { SYNC_ENTITIES, SYNC_MAX_BATCH, type SyncRequest, type SyncResponse } from '@invest/shared';
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
    const cursor = await store.getMeta('cursor');
    const response = await push({ cursor, changes: pending }, newKey());

    let pendingCount = 0;
    for (const entity of SYNC_ENTITIES) {
      const pushedAt = new Map(pending[entity].map((r) => [r.clientId, r.clientUpdatedAt]));
      pendingCount += pending[entity].length;
      const accepted = response.accepted[entity] ?? [];
      await store.markSynced(
        entity,
        accepted.flatMap((clientId) => {
          const clientUpdatedAt = pushedAt.get(clientId);
          return clientUpdatedAt ? [{ clientId, clientUpdatedAt }] : [];
        }),
      );
      result.pushed += accepted.length;
      result.pulled += response.changes[entity]?.length ?? 0;
    }
    for (const r of response.rejected) {
      await store.markRejected(r.entity, r.clientId, r.code);
    }
    await store.applyRemote(response.changes);
    await store.setMeta('cursor', response.cursor);
    result.rejected += response.rejected.length;

    if (!response.hasMore && pendingCount < SYNC_MAX_BATCH) break;
  }
  return result;
}
