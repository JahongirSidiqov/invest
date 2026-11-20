import { z } from 'zod';
import { CURRENCIES } from './money';

export const TRANSACTION_TYPES = [
  'income_active',
  'income_passive',
  'expense',
  'investment',
  'dividend',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const NECESSITY = ['essential', 'moderate', 'non_essential'] as const;
export type Necessity = (typeof NECESSITY)[number];

/** Which transaction type a category applies to. Investments and dividends link to assets (phase 3). */
export const CATEGORY_KINDS = ['expense', 'income_active', 'income_passive'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface DefaultCategory {
  slug: string;
  kind: CategoryKind;
  necessity: Necessity | null;
  icon: string;
}

/**
 * Built-in categories. They live in code, not in the database; names come from the
 * locale packs (`categories.<slug>`). Necessity defaults are drafts (docs/OPEN_QUESTIONS.md).
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { slug: 'food', kind: 'expense', necessity: 'essential', icon: 'shopping-cart' },
  { slug: 'cafe', kind: 'expense', necessity: 'non_essential', icon: 'coffee' },
  { slug: 'transport', kind: 'expense', necessity: 'essential', icon: 'navigation' },
  { slug: 'housing', kind: 'expense', necessity: 'essential', icon: 'home' },
  { slug: 'utilities', kind: 'expense', necessity: 'essential', icon: 'zap' },
  { slug: 'phone_internet', kind: 'expense', necessity: 'essential', icon: 'smartphone' },
  { slug: 'nasiya', kind: 'expense', necessity: 'essential', icon: 'credit-card' },
  { slug: 'health', kind: 'expense', necessity: 'essential', icon: 'heart' },
  { slug: 'education', kind: 'expense', necessity: 'moderate', icon: 'book' },
  { slug: 'clothing', kind: 'expense', necessity: 'moderate', icon: 'shopping-bag' },
  { slug: 'gifts', kind: 'expense', necessity: 'moderate', icon: 'gift' },
  { slug: 'sadaqa', kind: 'expense', necessity: 'moderate', icon: 'sun' },
  { slug: 'family_help', kind: 'expense', necessity: 'moderate', icon: 'users' },
  { slug: 'other_expense', kind: 'expense', necessity: 'moderate', icon: 'more-horizontal' },
  { slug: 'salary', kind: 'income_active', necessity: null, icon: 'briefcase' },
  { slug: 'side_job', kind: 'income_active', necessity: null, icon: 'tool' },
  { slug: 'stipend', kind: 'income_active', necessity: null, icon: 'award' },
  { slug: 'other_active', kind: 'income_active', necessity: null, icon: 'plus-circle' },
  { slug: 'rent_income', kind: 'income_passive', necessity: null, icon: 'key' },
  { slug: 'other_passive', kind: 'income_passive', necessity: null, icon: 'trending-up' },
];

export const DEFAULT_CATEGORY_SLUGS = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

export function defaultCategory(slug: string): DefaultCategory | undefined {
  return DEFAULT_CATEGORIES.find((c) => c.slug === slug);
}

/** Largest amount accepted: 10 trillion so'm in tiyin. Keeps every sum a safe integer. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');

/**
 * A category reference is either a built-in slug ("food") or the client id of a
 * custom category (UUID). Offline clients cannot know server ids, so references use these.
 */
export const categoryRefSchema = z.union([
  z.uuid(),
  z.string().refine((s) => DEFAULT_CATEGORY_SLUGS.has(s), 'unknown_category'),
]);

const syncMeta = {
  clientId: z.uuid(),
  clientUpdatedAt: z.iso.datetime(),
  deleted: z.boolean(),
};

const amount = z.number().int().positive().max(MAX_AMOUNT_MINOR);
const amountOrZero = z.number().int().min(0).max(MAX_AMOUNT_MINOR);

export const syncTransactionSchema = z
  .object({
    ...syncMeta,
    type: z.enum(TRANSACTION_TYPES),
    amountMinor: amount,
    currency: z.enum(CURRENCIES),
    category: categoryRefSchema.nullable(),
    necessity: z.enum(NECESSITY).nullable(),
    /** Client id of the asset an investment goes into or a dividend comes from. */
    asset: z.uuid().nullable(),
    /** Dividends only: true when reinvested into the asset instead of paid out. */
    capitalised: z.boolean().nullable(),
    occurredOn: isoDate,
    note: z.string().max(200).nullable(),
    source: z.enum(['manual', 'voice']),
  })
  .superRefine((t, ctx) => {
    if (t.deleted) return;
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (t.type === 'expense' && !t.necessity) issue('necessity', 'necessity_required');
    if (t.type !== 'expense' && t.necessity) issue('necessity', 'necessity_only_for_expense');
    const needsCategory =
      t.type === 'expense' || t.type === 'income_active' || t.type === 'income_passive';
    if (needsCategory && !t.category) issue('category', 'category_required');
    if (!needsCategory && t.category) issue('category', 'category_not_allowed');
    const builtIn = t.category ? defaultCategory(t.category) : undefined;
    if (builtIn && builtIn.kind !== t.type) issue('category', 'category_kind_mismatch');
    const needsAsset = t.type === 'investment' || t.type === 'dividend';
    if (needsAsset && !t.asset) issue('asset', 'asset_required');
    if (!needsAsset && t.asset) issue('asset', 'asset_not_allowed');
    if (t.type === 'dividend' && t.capitalised === null)
      issue('capitalised', 'capitalised_required');
    if (t.type !== 'dividend' && t.capitalised !== null)
      issue('capitalised', 'capitalised_only_for_dividend');
  });
export type SyncTransaction = z.infer<typeof syncTransactionSchema>;

export const syncCategorySchema = z
  .object({
    ...syncMeta,
    kind: z.enum(CATEGORY_KINDS),
    name: z.string().trim().min(1).max(40),
    necessity: z.enum(NECESSITY).nullable(),
    icon: z.string().max(40).nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.kind === 'expense' && !c.necessity) {
      ctx.addIssue({ code: 'custom', path: ['necessity'], message: 'necessity_required' });
    }
    if (c.kind !== 'expense' && c.necessity) {
      ctx.addIssue({ code: 'custom', path: ['necessity'], message: 'necessity_only_for_expense' });
    }
  });
export type SyncCategory = z.infer<typeof syncCategorySchema>;

export const ASSET_TYPES = [
  'iman',
  'asaxiy',
  'way2',
  'gold',
  'foreign_shares',
  'livestock',
  'bank_deposit',
  'card',
  'cash',
  'other',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Liquid by default (counts towards savings L); the user can change it per asset. */
export const LIQUID_BY_DEFAULT: ReadonlySet<AssetType> = new Set(['card', 'cash', 'bank_deposit']);

export const DIVIDEND_METHODS = ['withdraw', 'capitalise'] as const;
export type DividendMethod = (typeof DIVIDEND_METHODS)[number];

export const syncAssetSchema = z.object({
  ...syncMeta,
  type: z.enum(ASSET_TYPES),
  name: z.string().trim().min(1).max(60),
  liquid: z.boolean(),
  /** Default for new dividends from this asset; null for assets without dividends. */
  dividendMethod: z.enum(DIVIDEND_METHODS).nullable(),
  /** Money put in before the user started recording investment transactions. */
  openingInvestedMinor: amountOrZero,
  openedOn: isoDate,
  note: z.string().max(200).nullable(),
});
export type SyncAsset = z.infer<typeof syncAssetSchema>;

/** A dated current value of an asset, entered by the user. History gives net worth over time. */
export const syncValuationSchema = z.object({
  ...syncMeta,
  asset: z.uuid(),
  valueMinor: amountOrZero,
  valuedOn: isoDate,
});
export type SyncValuation = z.infer<typeof syncValuationSchema>;

export const LIABILITY_KINDS = ['bank_loan', 'nasiya', 'personal', 'other'] as const;

export const syncLiabilitySchema = z.object({
  ...syncMeta,
  kind: z.enum(LIABILITY_KINDS),
  name: z.string().trim().min(1).max(60),
  balanceMinor: amountOrZero,
  note: z.string().max(200).nullable(),
});
export type SyncLiability = z.infer<typeof syncLiabilitySchema>;

/**
 * Syncable entity types, in dependency order: referenced rows (categories, assets)
 * come before the rows that reference them.
 */
export const SYNC_ENTITIES = [
  'category',
  'asset',
  'liability',
  'valuation',
  'transaction',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export interface SyncRecordMap {
  category: SyncCategory;
  asset: SyncAsset;
  liability: SyncLiability;
  valuation: SyncValuation;
  transaction: SyncTransaction;
}

export type SyncChanges = { [E in SyncEntity]: SyncRecordMap[E][] };

export const SYNC_SCHEMAS = {
  category: syncCategorySchema,
  asset: syncAssetSchema,
  liability: syncLiabilitySchema,
  valuation: syncValuationSchema,
  transaction: syncTransactionSchema,
} as const;

export function emptyChanges(): SyncChanges {
  return { category: [], asset: [], liability: [], valuation: [], transaction: [] };
}

export const SYNC_MAX_BATCH = 500;

export const syncRequestSchema = z
  .object({
    /** Opaque cursor from the previous response; null on first sync. */
    cursor: z.string().regex(/^\d+$/).nullable(),
    changes: z
      .object({
        category: z.array(syncCategorySchema).default([]),
        asset: z.array(syncAssetSchema).default([]),
        liability: z.array(syncLiabilitySchema).default([]),
        valuation: z.array(syncValuationSchema).default([]),
        transaction: z.array(syncTransactionSchema).default([]),
      })
      .default(emptyChanges),
  })
  .refine((r) => SYNC_ENTITIES.reduce((n, e) => n + r.changes[e].length, 0) <= SYNC_MAX_BATCH, {
    message: 'batch_too_large',
  });
export type SyncRequest = { cursor: string | null; changes: Partial<SyncChanges> };

export interface SyncRejection {
  entity: SyncEntity;
  clientId: string;
  code: string;
}

export interface SyncResponse {
  cursor: string;
  hasMore: boolean;
  accepted: { [E in SyncEntity]: string[] };
  rejected: SyncRejection[];
  changes: SyncChanges;
}

export const DEFAULT_RESERVE_MINOR = 100_000_000; // 1 000 000 so'm

export const settingsSchema = z.object({
  /** Money kept on the card; anything above is "waiting to be invested". */
  reserveMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR),
  /** Yearly inflation assumption, e.g. 0.1 = 10%. Null until the user sets it. */
  inflationRate: z.number().min(0).max(1).nullable(),
  /** Yearly net return assumption for calculators. Null until the user sets it. */
  returnRate: z.number().min(-1).max(5).nullable(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  reserveMinor: DEFAULT_RESERVE_MINOR,
  inflationRate: null,
  returnRate: null,
};

export type LwwDecision = 'insert' | 'update' | 'ignore';

/**
 * Last write wins by client_updated_at. An equal timestamp is a resend of the same
 * write, so it is ignored; this keeps sync idempotent on both the phone and the server.
 */
export function lww(incomingUpdatedAt: string, existingUpdatedAt: string | null): LwwDecision {
  if (existingUpdatedAt === null) return 'insert';
  return Date.parse(incomingUpdatedAt) > Date.parse(existingUpdatedAt) ? 'update' : 'ignore';
}
