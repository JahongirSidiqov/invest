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

export const syncTransactionSchema = z
  .object({
    clientId: z.uuid(),
    type: z.enum(TRANSACTION_TYPES),
    amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
    currency: z.enum(CURRENCIES),
    category: categoryRefSchema.nullable(),
    necessity: z.enum(NECESSITY).nullable(),
    occurredOn: isoDate,
    note: z.string().max(200).nullable(),
    source: z.enum(['manual', 'voice']),
    clientUpdatedAt: z.iso.datetime(),
    deleted: z.boolean(),
  })
  .superRefine((t, ctx) => {
    if (t.deleted) return;
    if (t.type === 'expense' && !t.necessity) {
      ctx.addIssue({ code: 'custom', path: ['necessity'], message: 'necessity_required' });
    }
    if (t.type !== 'expense' && t.necessity) {
      ctx.addIssue({ code: 'custom', path: ['necessity'], message: 'necessity_only_for_expense' });
    }
    const needsCategory =
      t.type === 'expense' || t.type === 'income_active' || t.type === 'income_passive';
    if (needsCategory && !t.category) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'category_required' });
    }
    const builtIn = t.category ? defaultCategory(t.category) : undefined;
    if (builtIn && builtIn.kind !== t.type) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'category_kind_mismatch' });
    }
  });
export type SyncTransaction = z.infer<typeof syncTransactionSchema>;

export const syncCategorySchema = z
  .object({
    clientId: z.uuid(),
    kind: z.enum(CATEGORY_KINDS),
    name: z.string().trim().min(1).max(40),
    necessity: z.enum(NECESSITY).nullable(),
    icon: z.string().max(40).nullable(),
    clientUpdatedAt: z.iso.datetime(),
    deleted: z.boolean(),
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

export const SYNC_MAX_BATCH = 500;

export const syncRequestSchema = z
  .object({
    /** Opaque cursor from the previous response; null on first sync. */
    cursor: z.string().regex(/^\d+$/).nullable(),
    categories: z.array(syncCategorySchema).default([]),
    transactions: z.array(syncTransactionSchema).default([]),
  })
  .refine((r) => r.categories.length + r.transactions.length <= SYNC_MAX_BATCH, {
    message: 'batch_too_large',
  });
export type SyncRequest = z.input<typeof syncRequestSchema>;

export interface SyncRejection {
  entity: 'category' | 'transaction';
  clientId: string;
  code: string;
}

export interface SyncResponse {
  cursor: string;
  hasMore: boolean;
  accepted: { categories: string[]; transactions: string[] };
  rejected: SyncRejection[];
  changes: { categories: SyncCategory[]; transactions: SyncTransaction[] };
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
