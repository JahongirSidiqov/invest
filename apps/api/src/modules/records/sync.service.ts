import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  defaultCategory,
  lww,
  SYNC_MAX_BATCH,
  type SyncCategory,
  type SyncRejection,
  type SyncRequest,
  type SyncResponse,
  type SyncTransaction,
} from '@invest/shared';
import { AppError } from '../../common/problem.filter';
import { PrismaService, type Tx } from '../../infra/prisma.service';
import { REDIS, type RedisLike } from '../../infra/redis';
import { categoryToSync, fromDateOnly, transactionToSync } from './mappers';

type ParsedSyncRequest = {
  cursor: string | null;
  categories: SyncCategory[];
  transactions: SyncTransaction[];
};

const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;
const IN_FLIGHT_TTL_SECONDS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Offline sync: push (apply client changes with last-write-wins) then pull
 * (return rows with server_version above the client's cursor).
 * All writes for one user run under a per-user advisory lock, so versions are
 * committed in order and a pull never skips a row.
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
      const acceptedCategories = await this.pushCategories(tx, userId, request.categories);
      const acceptedTransactions = await this.pushTransactions(
        tx,
        userId,
        request.transactions,
        rejected,
      );
      const pulled = await this.pull(tx, userId, request.cursor);
      return {
        ...pulled,
        accepted: { categories: acceptedCategories, transactions: acceptedTransactions },
        rejected,
      };
    });
  }

  private async pushCategories(
    tx: Tx,
    userId: string,
    categories: SyncCategory[],
  ): Promise<string[]> {
    const accepted: string[] = [];
    for (const c of categories) {
      const existing = await tx.category.findUnique({
        where: { userId_clientId: { userId, clientId: c.clientId } },
        select: { clientUpdatedAt: true },
      });
      const decision = lww(c.clientUpdatedAt, existing?.clientUpdatedAt.toISOString() ?? null);
      const data = {
        kind: c.kind,
        name: c.name,
        necessity: c.necessity,
        icon: c.icon,
        clientUpdatedAt: new Date(c.clientUpdatedAt),
        deletedAt: c.deleted ? new Date() : null,
      };
      if (decision === 'insert') {
        await tx.category.create({ data: { ...data, userId, clientId: c.clientId } });
      } else if (decision === 'update') {
        await tx.category.update({
          where: { userId_clientId: { userId, clientId: c.clientId } },
          data,
        });
      }
      // 'ignore' is still accepted: the server already holds a newer or equal write.
      accepted.push(c.clientId);
    }
    return accepted;
  }

  private async pushTransactions(
    tx: Tx,
    userId: string,
    transactions: SyncTransaction[],
    rejected: SyncRejection[],
  ): Promise<string[]> {
    const customRefs = [
      ...new Set(
        transactions.map((t) => t.category).filter((c): c is string => !!c && UUID.test(c)),
      ),
    ];
    const customKinds = new Map(
      (
        await tx.category.findMany({
          where: { userId, clientId: { in: customRefs } },
          select: { clientId: true, kind: true },
        })
      ).map((c) => [c.clientId, c.kind]),
    );

    const accepted: string[] = [];
    for (const t of transactions) {
      const existing = await tx.transaction.findUnique({
        where: { userId_clientId: { userId, clientId: t.clientId } },
        select: { clientUpdatedAt: true },
      });
      const decision = lww(t.clientUpdatedAt, existing?.clientUpdatedAt.toISOString() ?? null);

      // Created and deleted offline before it ever reached the server: nothing to store.
      if (t.deleted && decision === 'insert') {
        accepted.push(t.clientId);
        continue;
      }

      if (!t.deleted && t.category) {
        const kind = UUID.test(t.category)
          ? customKinds.get(t.category)
          : defaultCategory(t.category)?.kind;
        if (!kind) {
          rejected.push({ entity: 'transaction', clientId: t.clientId, code: 'unknown_category' });
          continue;
        }
        if (kind !== t.type) {
          rejected.push({
            entity: 'transaction',
            clientId: t.clientId,
            code: 'category_kind_mismatch',
          });
          continue;
        }
      }

      const data = {
        type: t.type,
        amountMinor: BigInt(t.amountMinor),
        currency: t.currency,
        category: t.category,
        necessity: t.necessity,
        occurredOn: fromDateOnly(t.occurredOn),
        note: t.note,
        source: t.source,
        clientUpdatedAt: new Date(t.clientUpdatedAt),
        deletedAt: t.deleted ? new Date() : null,
      };
      if (decision === 'insert') {
        await tx.transaction.create({ data: { ...data, userId, clientId: t.clientId } });
      } else if (decision === 'update') {
        await tx.transaction.update({
          where: { userId_clientId: { userId, clientId: t.clientId } },
          data,
        });
      }
      accepted.push(t.clientId);
    }
    return accepted;
  }

  private async pull(
    tx: Tx,
    userId: string,
    cursor: string | null,
  ): Promise<Pick<SyncResponse, 'cursor' | 'hasMore' | 'changes'>> {
    const after = BigInt(cursor ?? '0');
    const [categories, transactions] = await Promise.all([
      tx.category.findMany({
        where: { userId, serverVersion: { gt: after } },
        orderBy: { serverVersion: 'asc' },
        take: SYNC_MAX_BATCH + 1,
      }),
      tx.transaction.findMany({
        where: { userId, serverVersion: { gt: after } },
        orderBy: { serverVersion: 'asc' },
        take: SYNC_MAX_BATCH + 1,
      }),
    ]);

    const merged = [
      ...categories.map((row) => ({ version: row.serverVersion, kind: 'category' as const, row })),
      ...transactions.map((row) => ({
        version: row.serverVersion,
        kind: 'transaction' as const,
        row,
      })),
    ].sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));

    const page = merged.slice(0, SYNC_MAX_BATCH);
    const last = page.at(-1);
    return {
      cursor: (last?.version ?? after).toString(),
      hasMore: merged.length > SYNC_MAX_BATCH,
      changes: {
        categories: page.flatMap((e) => (e.kind === 'category' ? [categoryToSync(e.row)] : [])),
        transactions: page.flatMap((e) =>
          e.kind === 'transaction' ? [transactionToSync(e.row)] : [],
        ),
      },
    };
  }
}

export type { ParsedSyncRequest, SyncRequest };
