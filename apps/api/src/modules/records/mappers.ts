import type { SyncCategory, SyncTransaction } from '@invest/shared';
import type { CategoryKind, Necessity, TransactionType } from '@invest/shared';

/** Postgres BIGINT -> JS number; amounts are capped well below 2^53 by validation. */
export function toSafeNumber(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError('BIGINT outside the safe integer range');
  return n;
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function fromDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export interface CategoryRow {
  clientId: string;
  kind: string;
  name: string;
  necessity: string | null;
  icon: string | null;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
}

export function categoryToSync(row: CategoryRow): SyncCategory {
  return {
    clientId: row.clientId,
    kind: row.kind as CategoryKind,
    name: row.name,
    necessity: row.necessity as Necessity | null,
    icon: row.icon,
    clientUpdatedAt: row.clientUpdatedAt.toISOString(),
    deleted: row.deletedAt !== null,
  };
}

export interface TransactionRow {
  clientId: string;
  type: string;
  amountMinor: bigint;
  currency: string;
  category: string | null;
  necessity: string | null;
  occurredOn: Date;
  note: string | null;
  source: string;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
}

export function transactionToSync(row: TransactionRow): SyncTransaction {
  return {
    clientId: row.clientId,
    type: row.type as TransactionType,
    amountMinor: toSafeNumber(row.amountMinor),
    currency: row.currency as SyncTransaction['currency'],
    category: row.category,
    necessity: row.necessity as Necessity | null,
    occurredOn: toDateOnly(row.occurredOn),
    note: row.note,
    source: row.source as SyncTransaction['source'],
    clientUpdatedAt: row.clientUpdatedAt.toISOString(),
    deleted: row.deletedAt !== null,
  };
}
