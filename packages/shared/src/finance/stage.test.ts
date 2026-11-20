import { describe, expect, it } from 'vitest';
import type { SyncTransaction } from '../records';
import {
  computeStage,
  kpis,
  lifeModel,
  missingFor,
  monthTotals,
  shiftMonth,
  type StageInputs,
  stageOf,
} from './stage';

const mln = (x: number) => Math.round(x * 1_000_000 * 100);

function inputs(over: Partial<StageInputs>): StageInputs {
  return {
    essentialMinor: mln(5),
    spendingMinor: mln(6),
    incomeMinor: mln(8),
    passiveMinor: 0,
    liquidMinor: 0,
    productiveMinor: 0,
    goalsMinor: 0,
    sources: 1,
    passiveSources: 0,
    ...over,
  };
}

let n = 0;
function tx(over: Partial<SyncTransaction>): SyncTransaction {
  return {
    clientId: `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`,
    type: 'expense',
    amountMinor: 0,
    currency: 'UZS',
    category: 'food',
    necessity: 'essential',
    asset: null,
    capitalised: null,
    occurredOn: '2026-10-10',
    note: null,
    source: 'manual',
    clientUpdatedAt: '2026-11-18T08:00:00.000Z',
    deleted: false,
    ...over,
  };
}

describe('stage fixtures (FINANCE_MODEL §6)', () => {
  // X + G = 6 mln in every row: spending 6, goals 0; or spending 5 + goals 2 = 7 where stated.
  it.each([
    [{ liquidMinor: mln(10) }, 1],
    [{ liquidMinor: mln(40) }, 2], // 8 months: was unclassified in the TZ
    [{ liquidMinor: mln(60), passiveMinor: mln(0.3), sources: 2, passiveSources: 1 }, 3],
    [{ passiveMinor: mln(5), spendingMinor: mln(7), sources: 2, passiveSources: 1 }, 4],
    [{ passiveMinor: mln(8), spendingMinor: mln(7), sources: 2, passiveSources: 1 }, 5],
  ] as const)('%o -> stage %i', (over, expected) => {
    expect(stageOf(inputs(over))).toBe(expected);
  });

  it('reports what is missing for the next stage', () => {
    expect(missingFor(1, inputs({ liquidMinor: mln(10) }))).toEqual({
      next: 2,
      savingsMinor: mln(5),
      needsPassiveSource: false,
    });
    expect(missingFor(4, inputs({ passiveMinor: mln(5), spendingMinor: mln(7) }))).toEqual({
      next: 5,
      monthlyMinor: mln(2),
    });
    expect(missingFor(5, inputs({}))).toBeNull();
  });

  it('needs a passive source for stage 3 even with a 12-month reserve', () => {
    expect(stageOf(inputs({ liquidMinor: mln(60) }))).toBe(2);
    expect(missingFor(2, inputs({ liquidMinor: mln(60) }))).toMatchObject({
      savingsMinor: 0,
      needsPassiveSource: true,
    });
  });
});

describe('months', () => {
  it('shifts across years', () => {
    expect(shiftMonth('2026-01', 1)).toBe('2025-12');
    expect(shiftMonth('2026-11', 3)).toBe('2026-08');
  });

  it('totals a month by type and necessity', () => {
    const rows = [
      tx({ amountMinor: mln(1) }),
      tx({ amountMinor: mln(0.5), necessity: 'non_essential', category: 'cafe' }),
      tx({ type: 'income_active', category: 'salary', necessity: null, amountMinor: mln(8) }),
      tx({
        type: 'dividend',
        category: null,
        necessity: null,
        asset: 'a',
        capitalised: false,
        amountMinor: mln(0.3),
      }),
      tx({ type: 'investment', category: null, necessity: null, asset: 'a', amountMinor: mln(2) }),
      tx({ amountMinor: mln(9), occurredOn: '2026-09-30' }), // other month
    ];
    expect(monthTotals(rows, '2026-10')).toEqual({
      month: '2026-10',
      incomeMinor: mln(8.3),
      passiveMinor: mln(0.3),
      expenseMinor: mln(1.5),
      essentialMinor: mln(1),
      investmentMinor: mln(2),
      records: 5,
    });
  });
});

describe('computeStage', () => {
  const salary = (month: string) =>
    tx({
      type: 'income_active',
      category: 'salary',
      necessity: null,
      amountMinor: mln(8),
      occurredOn: `${month}-10`,
    });
  const food = (month: string) => tx({ amountMinor: mln(5), occurredOn: `${month}-12` });

  it('has no stage without data or an onboarding spending answer', () => {
    expect(
      computeStage({
        transactions: [],
        currentMonth: '2026-11',
        liquidMinor: 0,
        productiveMinor: 0,
        onboarding: { savingsMinor: null, spendingMinor: null },
      }),
    ).toEqual({ status: 'no_data', monthsOfData: 0 });
  });

  it('is provisional from onboarding answers before 3 months of data', () => {
    const r = computeStage({
      transactions: [salary('2026-10')],
      currentMonth: '2026-11',
      liquidMinor: 0,
      productiveMinor: 0,
      onboarding: { savingsMinor: mln(20), spendingMinor: mln(5) },
    });
    expect(r).toMatchObject({ status: 'provisional', stage: 2, monthsOfData: 1 });
  });

  it('is final with 3 full months, ignoring the current month', () => {
    const months = ['2026-08', '2026-09', '2026-10'];
    const r = computeStage({
      transactions: [
        ...months.flatMap((m) => [salary(m), food(m)]),
        tx({ amountMinor: mln(100), occurredOn: '2026-11-02' }), // current month, ignored
      ],
      currentMonth: '2026-11',
      liquidMinor: mln(10),
      productiveMinor: 0,
      onboarding: { savingsMinor: null, spendingMinor: null },
    });
    expect(r).toMatchObject({
      status: 'final',
      stage: 1,
      monthsOfData: 3,
      missing: { next: 2, savingsMinor: mln(5) },
    });
  });
});

describe('kpis and life model', () => {
  it('computes ratios and the four models', () => {
    const month = {
      month: '2026-10',
      incomeMinor: mln(8.5),
      passiveMinor: 0,
      expenseMinor: mln(5.24),
      essentialMinor: mln(4),
      investmentMinor: mln(1.7),
      records: 10,
    };
    const k = kpis(
      month,
      inputs({ liquidMinor: mln(30), essentialMinor: mln(5), passiveMinor: mln(1.5) }),
    );
    expect(k.savingsRate).toBeCloseTo((8.5 - 5.24) / 8.5, 10);
    expect(k.emergencyMonths).toBe(6);
    expect(k.passiveCoverage).toBeCloseTo(0.3, 10);
    expect(k.investmentShare).toBeCloseTo(0.2, 10);
    expect(lifeModel(k.savingsRate, k)).toBe(3);
    expect(lifeModel(-0.1, { ...k, emergencyMonths: 0, passiveCoverage: 0 })).toBe(1);
    expect(lifeModel(0.1, { ...k, emergencyMonths: 1, passiveCoverage: 0 })).toBe(2);
    expect(lifeModel(0.1, { ...k, passiveCoverage: 1.2 })).toBe(4);
  });
});
