import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  defaultCategory,
  emptyChanges,
  lww,
  SYNC_ENTITIES,
  SYNC_MAX_BATCH,
  type SyncChanges,
  type SyncEntity,
  type SyncRecordMap,
  type SyncRejection,
  type SyncResponse,
} from '@invest/shared';
import { AppError } from '../../common/problem.filter';
import { PrismaService, type Tx } from '../../infra/prisma.service';
import { REDIS, type RedisLike } from '../../infra/redis';
import {
  assetToSync,
  categoryToSync,
  liabilityToSync,
  toData,
  transactionToSync,
  valuationToSync,
} from './mappers';

export type ParsedSyncRequest = { cursor: string | null; changes: SyncChanges };

const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;
const IN_FLIGHT_TTL_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Key = { userId_clientId: { userId: string; clientId: string } };
interface Row {
  serverVersion: bigint;
}

/** The part of a Prisma model delegate the sync code uses; every syncable table fits it. */
interface Delegate {
  findUnique(args: {
    where: Key;
    select: { clientUpdatedAt: true };
  }): Promise<{ clientUpdatedAt: Date } | null>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy?: { serverVersion: 'asc' };
    take?: number;
    select?: Record<string, true>;
  }): Promise<Row[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: Key; data: Record<string, unknown> }): Promise<unknown>;
}

const DELEGATES: { [E in SyncEntity]: (tx: Tx) => Delegate } = {
  category: (tx) => tx.category as unknown as Delegate,
  asset: (tx) => tx.asset as unknown as Delegate,
  liability: (tx) => tx.liability as unknown as Delegate,
  valuation: (tx) => tx.assetValuation as unknown as Delegate,
  transaction: (tx) => tx.transaction as unknown as Delegate,
};

const FROM_ROW: { [E in SyncEntity]: (row: never) => SyncRecordMap[E] } = {
  category: categoryToSync,
  asset: assetToSync,
  liability: liabilityToSync,
  valuation: valuationToSync,
  transaction: transactionToSync,
};

/**
 * Offline sync for every syncable entity: push (apply client changes with
 * last-write-wins, in dependency order) then pull (rows with server_version above
 * the client's cursor). All writes for one user run under a per-user advisory lock,
 * so versions are committed in order and a pull never skips a row.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: RedisLike,
  ) {}

  /** Replays the stored response for a repeated Idempotency-Key. */
  async syncIdempotent(
    userId: string,
    idempotencyKey: string | undefined,
    request: ParsedSyncRequest,
  ): Promise<SyncResponse> {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'idempotency_key_required');
    }
    const key = `idem:sync:${userId}:${idempotencyKey}`;
    const claimed = await this.redis.set(key, 'pending', 'EX', IN_FLIGHT_TTL_SECONDS, 'NX');
    if (claimed === null) {
      const stored = await this.redis.get(key);
      if (stored && stored !== 'pending') return JSON.parse(stored) as SyncResponse;
      throw new AppError(HttpStatus.CONFLICT, 'request_in_progress');
    }
    try {
      const response = await this.sync(userId, request);
      await this.redis.set(key, JSON.stringify(response), 'EX', IDEMPOTENCY_TTL_SECONDS);
      return response;
    } catch (error) {
      await this.redis.del(key);
      throw error;
    }
  }

  sync(userId: string, request: ParsedSyncRequest): Promise<SyncResponse> {
    return this.prisma.asUser(userId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
      const rejected: SyncRejection[] = [];
      const accepted = Object.fromEntries(SYNC_ENTITIES.map((e) => [e, [] as string[]])) as {
        [E in SyncEntity]: string[];
      };
      for (const entity of SYNC_ENTITIES) {
        accepted[entity] = await this.push(tx, userId, entity, request.changes[entity], rejected);
      }
      return { ...(await this.pull(tx, userId, request.cursor)), accepted, rejected };
    });
  }

  private async push<E extends SyncEntity>(
    tx: Tx,
    userId: string,
    entity: E,
    records: SyncRecordMap[E][],
    rejected: SyncRejection[],
  ): Promise<string[]> {
    if (records.length === 0) return [];
    const delegate = DELEGATES[entity](tx);
    const refCheck = await this.referenceChecker(tx, userId, entity, records);
    const accepted: string[] = [];

    for (const record of records) {
      const where = { userId_clientId: { userId, clientId: record.clientId } };
      const existing = await delegate.findUnique({ where, select: { clientUpdatedAt: true } });
      const decision = lww(record.clientUpdatedAt, existing?.clientUpdatedAt.toISOString() ?? null);

      // Created and deleted offline before it ever reached the server: nothing to store.
      if (record.deleted && decision === 'insert') {
        accepted.push(record.clientId);
        continue;
      }
      const problem = record.deleted ? null : refCheck(record);
      if (problem) {
        rejected.push({ entity, clientId: record.clientId, code: problem });
        continue;
      }
      const data = (toData[entity] as (r: SyncRecordMap[E]) => Record<string, unknown>)(record);
      if (decision === 'insert') {
        await delegate.create({ data: { ...data, userId, clientId: record.clientId } });
      } else if (decision === 'update') {
        await delegate.update({ where, data });
      }
      // 'ignore' is still accepted: the server already holds a newer or equal write.
      accepted.push(record.clientId);
    }
    return accepted;
  }

  /**
   * References between entities use client ids. Referenced rows (categories, assets)
   * are pushed first in the same transaction, so a lookup here sees them.
   */
  private async referenceChecker<E extends SyncEntity>(
    tx: Tx,
    userId: string,
    entity: E,
    records: SyncRecordMap[E][],
  ): Promise<(record: SyncRecordMap[E]) => string | null> {
    if (entity === 'valuation') {
      const assets = await this.existingIds(
        tx,
        'asset',
        userId,
        (records as SyncRecordMap['valuation'][]).map((v) => v.asset),
      );
      return (r) => (assets.has((r as SyncRecordMap['valuation']).asset) ? null : 'unknown_asset');
    }
    if (entity !== 'transaction') return () => null;

    const txs = records as SyncRecordMap['transaction'][];
    const customRefs = txs.map((t) => t.category).filter((c): c is string => !!c && UUID.test(c));
    const categoryRows = (await tx.category.findMany({
      where: { userId, clientId: { in: [...new Set(customRefs)] } },
      select: { clientId: true, kind: true },
    })) as { clientId: string; kind: string }[];
    const customKinds = new Map(categoryRows.map((c) => [c.clientId, c.kind]));
    const assets = await this.existingIds(
      tx,
      'asset',
      userId,
      txs.map((t) => t.asset).filter((a): a is string => !!a),
    );

    return (record) => {
      const t = record as SyncRecordMap['transaction'];
      if (t.category) {
        const kind = UUID.test(t.category)
          ? customKinds.get(t.category)
          : defaultCategory(t.category)?.kind;
        if (!kind) return 'unknown_category';
        if (kind !== t.type) return 'category_kind_mismatch';
      }
      if (t.asset && !assets.has(t.asset)) return 'unknown_asset';
      return null;
    };
  }

  private async existingIds(
    tx: Tx,
    entity: SyncEntity,
    userId: string,
    clientIds: string[],
  ): Promise<Set<string>> {
    if (clientIds.length === 0) return new Set();
    const rows = (await DELEGATES[entity](tx).findMany({
      where: { userId, clientId: { in: [...new Set(clientIds)] } },
      select: { clientId: true },
    })) as unknown as { clientId: string }[];
    return new Set(rows.map((r) => r.clientId));
  }

  private async pull(
    tx: Tx,
    userId: string,
    cursor: string | null,
  ): Promise<Pick<SyncResponse, 'cursor' | 'hasMore' | 'changes'>> {
    const after = BigInt(cursor ?? '0');
    const perEntity = await Promise.all(
      SYNC_ENTITIES.map(async (entity) => {
        const rows = await DELEGATES[entity](tx).findMany({
          where: { userId, serverVersion: { gt: after } },
          orderBy: { serverVersion: 'asc' },
          take: SYNC_MAX_BATCH + 1,
        });
        return rows.map((row) => ({ entity, row }));
      }),
    );
    // Rows not fetched from a table have a higher version than everything fetched from
    // it, so the first 500 by version across tables never skip anything.
    const merged = perEntity
      .flat()
      .sort((a, b) =>
        a.row.serverVersion < b.row.serverVersion
          ? -1
          : a.row.serverVersion > b.row.serverVersion
            ? 1
            : 0,
      );
    const page = merged.slice(0, SYNC_MAX_BATCH);
    const changes = emptyChanges();
    for (const { entity, row } of page) {
      (changes[entity] as unknown[]).push(FROM_ROW[entity](row as never));
    }
    return {
      cursor: (page.at(-1)?.row.serverVersion ?? after).toString(),
      hasMore: merged.length > SYNC_MAX_BATCH,
      changes,
    };
  }
}
