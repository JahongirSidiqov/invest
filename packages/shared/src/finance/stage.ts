import type { SyncTransaction } from '../records';

/**
 * The 5-stage model, KPIs and life model from docs/FINANCE_MODEL.md §1–4.
 * Pure functions over the user's own records; no LLM, no guessing.
 */

export type Stage = 1 | 2 | 3 | 4 | 5;

export interface MonthTotals {
  month: string; // YYYY-MM
  incomeMinor: number; // active + passive + dividends
  passiveMinor: number; // passive income + dividends
  expenseMinor: number; // X
  essentialMinor: number; // M
  investmentMinor: number;
  records: number;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** YYYY-MM of the n-th month before `month` (n = 1 is the previous month). */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) - n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthTotals(transactions: SyncTransaction[], month: string): MonthTotals {
  const t: MonthTotals = {
    month,
    incomeMinor: 0,
    passiveMinor: 0,
    expenseMinor: 0,
    essentialMinor: 0,
    investmentMinor: 0,
    records: 0,
  };
  for (const r of transactions) {
    if (r.deleted || monthOf(r.occurredOn) !== month) continue;
    t.records++;
    switch (r.type) {
      case 'income_active':
        t.incomeMinor += r.amountMinor;
        break;
      case 'income_passive':
      case 'dividend':
        t.incomeMinor += r.amountMinor;
        t.passiveMinor += r.amountMinor;
        break;
      case 'expense':
        t.expenseMinor += r.amountMinor;
        if (r.necessity === 'essential') t.essentialMinor += r.amountMinor;
        break;
      case 'investment':
        t.investmentMinor += r.amountMinor;
        break;
    }
  }
  return t;
}

/** Distinct income streams in the window: active counts once, each passive source once. */
export function incomeSources(transactions: SyncTransaction[], months: string[]) {
  let active = false;
  const passive = new Set<string>();
  for (const r of transactions) {
    if (r.deleted || !months.includes(monthOf(r.occurredOn))) continue;
    if (r.type === 'income_active') active = true;
    if (r.type === 'income_passive') passive.add(`c:${r.category ?? 'other'}`);
    if (r.type === 'dividend') passive.add(`a:${r.asset ?? 'other'}`);
  }
  return { count: (active ? 1 : 0) + passive.size, passive: passive.size };
}

export interface StageInputs {
  /** M: essential monthly spending */
  essentialMinor: number;
  /** X: total monthly spending */
  spendingMinor: number;
  /** I: monthly income */
  incomeMinor: number;
  /** P: passive monthly income */
  passiveMinor: number;
  /** L: liquid savings */
  liquidMinor: number;
  /** A: productive assets */
  productiveMinor: number;
  /** G: monthly cost of big goals (0 until goals exist) */
  goalsMinor: number;
  sources: number;
  passiveSources: number;
}

export interface Onboarding {
  savingsMinor: number | null;
  spendingMinor: number | null;
}

export type StageResult =
  | { status: 'no_data'; monthsOfData: number }
  | {
      status: 'final' | 'provisional';
      stage: Stage;
      monthsOfData: number;
      inputs: StageInputs;
      /** What is missing for the next stage; null at stage 5. */
      missing: Missing | null;
    };

export type Missing =
  | { next: 2 | 3; savingsMinor: number; needsPassiveSource: boolean }
  | { next: 4; monthlyMinor: number }
  | { next: 5; monthlyMinor: number };

export const FULL_DATA_MONTHS = 3;

/** Checked from 5 down to 1; the first rule that holds is the stage (FINANCE_MODEL §2). */
export function stageOf(i: StageInputs): Stage {
  if (i.passiveMinor > 0 && i.passiveMinor >= i.spendingMinor + i.goalsMinor) return 5;
  if (i.passiveMinor > 0 && i.passiveMinor >= i.essentialMinor) return 4;
  if (i.liquidMinor >= 12 * i.essentialMinor && i.sources >= 2 && i.passiveSources >= 1) return 3;
  if (i.liquidMinor >= 3 * i.essentialMinor) return 2;
  return 1;
}

export function missingFor(stage: Stage, i: StageInputs): Missing | null {
  switch (stage) {
    case 1:
      return {
        next: 2,
        savingsMinor: Math.max(3 * i.essentialMinor - i.liquidMinor, 0),
        needsPassiveSource: false,
      };
    case 2:
      return {
        next: 3,
        savingsMinor: Math.max(12 * i.essentialMinor - i.liquidMinor, 0),
        needsPassiveSource: i.passiveSources === 0 || i.sources < 2,
      };
    case 3:
      return { next: 4, monthlyMinor: Math.max(i.essentialMinor - i.passiveMinor, 0) };
    case 4:
      return {
        next: 5,
        monthlyMinor: Math.max(i.spendingMinor + i.goalsMinor - i.passiveMinor, 0),
      };
    case 5:
      return null;
  }
}

function average(values: number[]): number {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
}

/**
 * Stage from the last 3 full months (ending with the month before `currentMonth`).
 * With fewer months of data the result is provisional and spending comes from the
 * onboarding answer; with no spending figure at all there is no stage.
 */
export function computeStage(args: {
  transactions: SyncTransaction[];
  currentMonth: string;
  liquidMinor: number;
  productiveMinor: number;
  onboarding: Onboarding;
  goalsMinor?: number;
}): StageResult {
  const months = [1, 2, 3].map((n) => shiftMonth(args.currentMonth, n));
  const totals = months.map((m) => monthTotals(args.transactions, m));
  const withData = totals.filter((t) => t.records > 0);
  const monthsOfData = withData.length;
  const sources = incomeSources(args.transactions, months);
  const final = monthsOfData >= FULL_DATA_MONTHS;

  const liquidMinor = args.liquidMinor > 0 ? args.liquidMinor : (args.onboarding.savingsMinor ?? 0);

  let essentialMinor: number;
  let spendingMinor: number;
  if (final) {
    essentialMinor = average(totals.map((t) => t.essentialMinor));
    spendingMinor = average(totals.map((t) => t.expenseMinor));
  } else {
    if (args.onboarding.spendingMinor === null) return { status: 'no_data', monthsOfData };
    // Until essential spending is known, M = X (FINANCE_MODEL §2).
    spendingMinor = args.onboarding.spendingMinor;
    essentialMinor = args.onboarding.spendingMinor;
  }

  const inputs: StageInputs = {
    essentialMinor,
    spendingMinor,
    incomeMinor: average(withData.map((t) => t.incomeMinor)),
    passiveMinor: average(withData.map((t) => t.passiveMinor)),
    liquidMinor,
    productiveMinor: args.productiveMinor,
    goalsMinor: args.goalsMinor ?? 0,
    sources: sources.count,
    passiveSources: sources.passive,
  };
  const stage = stageOf(inputs);
  return {
    status: final ? 'final' : 'provisional',
    stage,
    monthsOfData,
    inputs,
    missing: missingFor(stage, inputs),
  };
}

export interface Kpis {
  savingsRate: number | null; // (I − X) / I
  emergencyMonths: number | null; // L / M
  passiveCoverage: number | null; // P / M (FIR)
  investmentShare: number | null; // investments / income
}

/** Home KPIs for one month plus the stage inputs (FINANCE_MODEL §3). */
export function kpis(month: MonthTotals, inputs: StageInputs | null): Kpis {
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    savingsRate: ratio(month.incomeMinor - month.expenseMinor, month.incomeMinor),
    emergencyMonths: inputs ? ratio(inputs.liquidMinor, inputs.essentialMinor) : null,
    passiveCoverage: inputs ? ratio(inputs.passiveMinor, inputs.essentialMinor) : null,
    investmentShare: ratio(month.investmentMinor, month.incomeMinor),
  };
}

export type LifeModel = 1 | 2 | 3 | 4;

/** FINANCE_MODEL §4, checked 4 → 1; months that fit none show as model 2. */
export function lifeModel(savingsRate: number | null, k: Kpis): LifeModel {
  if (k.passiveCoverage !== null && k.passiveCoverage >= 1) return 4;
  if (savingsRate !== null && savingsRate < 0) return 1;
  if (savingsRate !== null && savingsRate > 0 && (k.emergencyMonths ?? 0) >= 3) return 3;
  return 2;
}
