import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ru from './locales/ru.json';
import uz from './locales/uz.json';
import {
  DEFAULT_CATEGORIES,
  lww,
  SYNC_MAX_BATCH,
  syncCategorySchema,
  syncRequestSchema,
  syncTransactionSchema,
} from './records';

const base = {
  clientId: '0193a0e1-7c3a-7b1e-8f00-000000000001',
  type: 'expense' as const,
  amountMinor: 4_000_000,
  currency: 'UZS' as const,
  category: 'food',
  necessity: 'essential' as const,
  asset: null,
  capitalised: null,
  occurredOn: '2026-11-18',
  note: 'Tushlik',
  source: 'manual' as const,
  clientUpdatedAt: '2026-11-18T08:00:00.000Z',
  deleted: false,
};

function codes(input: unknown) {
  const result = syncTransactionSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('default categories', () => {
  it('have unique slugs', () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each([
    ['uz', uz],
    ['ru', ru],
    ['en', en],
  ])('are translated in %s', (_name, pack) => {
    const names = (pack as { categories: Record<string, string> }).categories;
    for (const c of DEFAULT_CATEGORIES) expect(names[c.slug], c.slug).toBeTruthy();
  });

  it('expense categories carry a necessity, income ones do not', () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.necessity === null, c.slug).toBe(c.kind !== 'expense');
    }
  });
});

describe('syncTransactionSchema', () => {
  it('accepts a valid expense', () => {
    expect(codes(base)).toEqual([]);
  });

  it('requires necessity on expenses and forbids it elsewhere', () => {
    expect(codes({ ...base, necessity: null })).toContain('necessity_required');
    expect(
      codes({ ...base, type: 'income_active', category: 'salary', necessity: 'essential' }),
    ).toContain('necessity_only_for_expense');
  });

  it('requires a category of the matching kind', () => {
    expect(codes({ ...base, category: null })).toContain('category_required');
    expect(codes({ ...base, category: 'salary' })).toContain('category_kind_mismatch');
    expect(codes({ ...base, category: 'not-a-slug' })).not.toEqual([]);
  });

  it('links investments and dividends to an asset, without a category', () => {
    const asset = '0193a0e1-7c3a-7b1e-8f00-0000000000aa';
    const inv = { ...base, type: 'investment', category: null, necessity: null, asset };
    expect(codes(inv)).toEqual([]);
    expect(codes({ ...inv, asset: null })).toContain('asset_required');
    expect(codes({ ...inv, category: 'food' })).toContain('category_not_allowed');
    const div = { ...inv, type: 'dividend', capitalised: false };
    expect(codes(div)).toEqual([]);
    expect(codes({ ...div, capitalised: null })).toContain('capitalised_required');
    expect(codes({ ...inv, capitalised: true })).toContain('capitalised_only_for_dividend');
    expect(codes({ ...base, asset })).toContain('asset_not_allowed');
  });

  it('accepts a custom category by client id', () => {
    expect(codes({ ...base, category: '0193a0e1-7c3a-7b1e-8f00-0000000000ff' })).toEqual([]);
  });

  it('rejects non-integer, zero and oversized amounts', () => {
    expect(codes({ ...base, amountMinor: 10.5 })).not.toEqual([]);
    expect(codes({ ...base, amountMinor: 0 })).not.toEqual([]);
    expect(codes({ ...base, amountMinor: 2e15 })).not.toEqual([]);
  });

  it('lets a tombstone through without content checks', () => {
    expect(codes({ ...base, necessity: null, category: null, deleted: true })).toEqual([]);
  });
});

describe('syncCategorySchema', () => {
  it('needs a necessity for expense categories', () => {
    const cat = {
      clientId: base.clientId,
      kind: 'expense',
      name: 'Sport',
      necessity: null,
      icon: null,
      clientUpdatedAt: base.clientUpdatedAt,
      deleted: false,
    };
    expect(syncCategorySchema.safeParse(cat).success).toBe(false);
    expect(syncCategorySchema.safeParse({ ...cat, necessity: 'moderate' }).success).toBe(true);
  });
});

describe('syncRequestSchema', () => {
  it('limits the batch size', () => {
    const many = Array.from({ length: SYNC_MAX_BATCH + 1 }, () => base);
    expect(
      syncRequestSchema.safeParse({ cursor: null, changes: { transaction: many } }).success,
    ).toBe(false);
    expect(
      syncRequestSchema.safeParse({ cursor: '42', changes: { transaction: [base] } }).success,
    ).toBe(true);
    expect(syncRequestSchema.parse({ cursor: null }).changes.asset).toEqual([]);
  });
});

describe('lww', () => {
  it('inserts new, updates newer, ignores equal or older', () => {
    expect(lww('2026-11-18T08:00:00Z', null)).toBe('insert');
    expect(lww('2026-11-18T08:00:01Z', '2026-11-18T08:00:00Z')).toBe('update');
    expect(lww('2026-11-18T08:00:00Z', '2026-11-18T08:00:00.000Z')).toBe('ignore');
    expect(lww('2026-11-18T07:59:59Z', '2026-11-18T08:00:00Z')).toBe('ignore');
  });
});
