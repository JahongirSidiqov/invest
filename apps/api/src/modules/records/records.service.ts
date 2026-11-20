import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AssetPosition,
  assetPositions,
  DEFAULT_CATEGORIES,
  wealthSummary,
  type WealthSummary,
  type SyncTransaction,
  TRANSACTION_TYPES,
  type TransactionType,
} from '@invest/shared';
import { z } from 'zod';
import { AppError } from '../../common/problem.filter';
import { PrismaService } from '../../infra/prisma.service';
import { SettingsService } from '../users/settings.service';
import {
  assetToSync,
  categoryToSync,
  fromDateOnly,
  liabilityToSync,
  toDateOnly,
  transactionToSync,
  valuationToSync,
} from './mappers';

export const listQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export type ListQuery = z.output<typeof listQuerySchema>;

export interface CategoryView {
  ref: string;
  builtIn: boolean;
  kind: string;
  name: string | null;
  necessity: string | null;
  icon: string | null;
}

function encodeCursor(occurredOn: string, id: string): string {
  return Buffer.from(`${occurredOn}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { occurredOn: string; id: string } {
  const [occurredOn, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!occurredOn || !id || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new AppError(HttpStatus.BAD_REQUEST, 'invalid_cursor');
  }
  return { occurredOn, id };
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async wealth(userId: string): Promise<{ positions: AssetPosition[]; summary: WealthSummary }> {
    const { reserveMinor } = await this.settings.get(userId);
    return this.prisma.asUser(userId, async (tx) => {
      const live = { userId, deletedAt: null };
      const [assets, valuations, transactions, liabilities] = await Promise.all([
        tx.asset.findMany({ where: live }),
        tx.assetValuation.findMany({ where: live }),
        tx.transaction.findMany({
          where: { ...live, type: { in: ['investment', 'dividend'] } },
        }),
        tx.liability.findMany({ where: live }),
      ]);
      const positions = assetPositions(
        assets.map(assetToSync),
        valuations.map(valuationToSync),
        transactions.map(transactionToSync),
      );
      return {
        positions,
        summary: wealthSummary(positions, liabilities.map(liabilityToSync), reserveMinor),
      };
    });
  }

  /** Built-in categories (names come from the app's locale packs) plus the user's own. */
  listCategories(userId: string): Promise<CategoryView[]> {
    return this.prisma.asUser(userId, async (tx) => {
      const custom = await tx.category.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      return [
        ...DEFAULT_CATEGORIES.map((c) => ({
          ref: c.slug,
          builtIn: true,
          kind: c.kind,
          name: null,
          necessity: c.necessity,
          icon: c.icon,
        })),
        ...custom.map((row) => {
          const c = categoryToSync(row);
          return {
            ref: c.clientId,
            builtIn: false,
            kind: c.kind,
            name: c.name,
            necessity: c.necessity,
            icon: c.icon,
          };
        }),
      ];
    });
  }

  /** Newest first, keyset pagination on (occurred_on, id). Deleted records are excluded. */
  listTransactions(
    userId: string,
    query: ListQuery,
  ): Promise<{ items: SyncTransaction[]; nextCursor: string | null }> {
    return this.prisma.asUser(userId, async (tx) => {
      const after = query.cursor ? decodeCursor(query.cursor) : null;
      const rows = await tx.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(query.type ? { type: query.type as TransactionType } : {}),
          occurredOn: {
            ...(query.from ? { gte: fromDateOnly(query.from) } : {}),
            ...(query.to ? { lte: fromDateOnly(query.to) } : {}),
          },
          ...(after
            ? {
                OR: [
                  { occurredOn: { lt: fromDateOnly(after.occurredOn) } },
                  { occurredOn: fromDateOnly(after.occurredOn), id: { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(transactionToSync),
        nextCursor:
          rows.length > query.limit && last
            ? encodeCursor(toDateOnly(last.occurredOn), last.id)
            : null,
      };
    });
  }
}
