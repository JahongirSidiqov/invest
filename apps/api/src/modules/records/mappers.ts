import type {
  CategoryKind,
  Necessity,
  SyncAsset,
  SyncCategory,
  SyncEntity,
  SyncLiability,
  SyncRecordMap,
  SyncTransaction,
  SyncValuation,
  TransactionType,
} from '@invest/shared';

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

interface SyncColumns {
  clientId: string;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
}

function meta(row: SyncColumns) {
  return {
    clientId: row.clientId,
    clientUpdatedAt: row.clientUpdatedAt.toISOString(),
    deleted: row.deletedAt !== null,
  };
}

/** Columns every syncable table shares, from an incoming record. */
export function metaToData(r: { clientUpdatedAt: string; deleted: boolean }) {
  return { clientUpdatedAt: new Date(r.clientUpdatedAt), deletedAt: r.deleted ? new Date() : null };
}

export interface CategoryRow extends SyncColumns {
  kind: string;
  name: string;
  necessity: string | null;
  icon: string | null;
}

export function categoryToSync(row: CategoryRow): SyncCategory {
  return {
    ...meta(row),
    kind: row.kind as CategoryKind,
    name: row.name,
    necessity: row.necessity as Necessity | null,
    icon: row.icon,
  };
}

export interface TransactionRow extends SyncColumns {
  type: string;
  amountMinor: bigint;
  currency: string;
  category: string | null;
  necessity: string | null;
  asset: string | null;
  capitalised: boolean | null;
  occurredOn: Date;
  note: string | null;
  source: string;
}

export function transactionToSync(row: TransactionRow): SyncTransaction {
  return {
    ...meta(row),
    type: row.type as TransactionType,
    amountMinor: toSafeNumber(row.amountMinor),
    currency: row.currency as SyncTransaction['currency'],
    category: row.category,
    necessity: row.necessity as Necessity | null,
    asset: row.asset,
    capitalised: row.capitalised,
    occurredOn: toDateOnly(row.occurredOn),
    note: row.note,
    source: row.source as SyncTransaction['source'],
  };
}

export interface AssetRow extends SyncColumns {
  type: string;
  name: string;
  liquid: boolean;
  dividendMethod: string | null;
  openingInvestedMinor: bigint;
  openedOn: Date;
  note: string | null;
}

export function assetToSync(row: AssetRow): SyncAsset {
  return {
    ...meta(row),
    type: row.type as SyncAsset['type'],
    name: row.name,
    liquid: row.liquid,
    dividendMethod: row.dividendMethod as SyncAsset['dividendMethod'],
    openingInvestedMinor: toSafeNumber(row.openingInvestedMinor),
    openedOn: toDateOnly(row.openedOn),
    note: row.note,
  };
}

export interface ValuationRow extends SyncColumns {
  asset: string;
  valueMinor: bigint;
  valuedOn: Date;
}

export function valuationToSync(row: ValuationRow): SyncValuation {
  return {
    ...meta(row),
    asset: row.asset,
    valueMinor: toSafeNumber(row.valueMinor),
    valuedOn: toDateOnly(row.valuedOn),
  };
}

export interface LiabilityRow extends SyncColumns {
  kind: string;
  name: string;
  balanceMinor: bigint;
  note: string | null;
}

export function liabilityToSync(row: LiabilityRow): SyncLiability {
  return {
    ...meta(row),
    kind: row.kind as SyncLiability['kind'],
    name: row.name,
    balanceMinor: toSafeNumber(row.balanceMinor),
    note: row.note,
  };
}

/** Incoming record -> table columns (without user_id / client_id). */
export const toData: { [E in SyncEntity]: (r: SyncRecordMap[E]) => Record<string, unknown> } = {
  category: (c) => ({
    kind: c.kind,
    name: c.name,
    necessity: c.necessity,
    icon: c.icon,
    ...metaToData(c),
  }),
  asset: (a) => ({
    type: a.type,
    name: a.name,
    liquid: a.liquid,
    dividendMethod: a.dividendMethod,
    openingInvestedMinor: BigInt(a.openingInvestedMinor),
    openedOn: fromDateOnly(a.openedOn),
    note: a.note,
    ...metaToData(a),
  }),
  liability: (l) => ({
    kind: l.kind,
    name: l.name,
    balanceMinor: BigInt(l.balanceMinor),
    note: l.note,
    ...metaToData(l),
  }),
  valuation: (v) => ({
    asset: v.asset,
    valueMinor: BigInt(v.valueMinor),
    valuedOn: fromDateOnly(v.valuedOn),
    ...metaToData(v),
  }),
  transaction: (t) => ({
    type: t.type,
    amountMinor: BigInt(t.amountMinor),
    currency: t.currency,
    category: t.category,
    necessity: t.necessity,
    asset: t.asset,
    capitalised: t.capitalised,
    occurredOn: fromDateOnly(t.occurredOn),
    note: t.note,
    source: t.source,
    ...metaToData(t),
  }),
};
