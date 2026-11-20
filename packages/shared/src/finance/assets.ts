import type { SyncAsset, SyncLiability, SyncTransaction, SyncValuation } from '../records';

/**
 * Asset positions computed from the user's own records (docs/FINANCE_MODEL.md §1, §3).
 * Pure functions: the phone and the server call them with the same rows.
 */
export interface AssetPosition {
  asset: SyncAsset;
  /** Last valuation, plus investments and capitalised dividends recorded after it. */
  currentValueMinor: number;
  valuedOn: string;
  /** Opening amount plus every investment transaction into this asset. */
  investedMinor: number;
  withdrawnDividendsMinor: number;
  capitalisedDividendsMinor: number;
  /** current value + withdrawn dividends − invested */
  gainMinor: number;
  /** gain / invested; null when nothing was invested */
  roi: number | null;
}

function latestValuation(valuations: SyncValuation[]): SyncValuation | undefined {
  return valuations.reduce<SyncValuation | undefined>((best, v) => {
    if (!best) return v;
    if (v.valuedOn !== best.valuedOn) return v.valuedOn > best.valuedOn ? v : best;
    return v.clientUpdatedAt > best.clientUpdatedAt ? v : best;
  }, undefined);
}

export function assetPositions(
  assets: SyncAsset[],
  valuations: SyncValuation[],
  transactions: SyncTransaction[],
): AssetPosition[] {
  const live = <T extends { deleted: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);
  const liveValuations = live(valuations);
  const liveTransactions = live(transactions);

  return live(assets).map((asset) => {
    const own = liveTransactions.filter((t) => t.asset === asset.clientId);
    const last = latestValuation(liveValuations.filter((v) => v.asset === asset.clientId));
    const baseValue = last ? last.valueMinor : asset.openingInvestedMinor;
    const baseDate = last ? last.valuedOn : asset.openedOn;

    let investedMinor = asset.openingInvestedMinor;
    let withdrawn = 0;
    let capitalised = 0;
    let addedAfterBase = 0;
    for (const t of own) {
      if (t.type === 'investment') {
        investedMinor += t.amountMinor;
        if (t.occurredOn > baseDate) addedAfterBase += t.amountMinor;
      } else if (t.type === 'dividend') {
        if (t.capitalised) {
          capitalised += t.amountMinor;
          if (t.occurredOn > baseDate) addedAfterBase += t.amountMinor;
        } else {
          withdrawn += t.amountMinor;
        }
      }
    }

    const currentValueMinor = baseValue + addedAfterBase;
    const gainMinor = currentValueMinor + withdrawn - investedMinor;
    return {
      asset,
      currentValueMinor,
      valuedOn: baseDate,
      investedMinor,
      withdrawnDividendsMinor: withdrawn,
      capitalisedDividendsMinor: capitalised,
      gainMinor,
      roi: investedMinor > 0 ? gainMinor / investedMinor : null,
    };
  });
}

export interface WealthSummary {
  /** L: liquid savings */
  liquidMinor: number;
  /** A: productive (non-liquid) assets */
  productiveMinor: number;
  /** D: liabilities */
  liabilitiesMinor: number;
  /** L + A − D */
  netWorthMinor: number;
  /** Card balances above the reserve: money waiting to be invested */
  waitingToInvestMinor: number;
}

export function wealthSummary(
  positions: AssetPosition[],
  liabilities: SyncLiability[],
  reserveMinor: number,
): WealthSummary {
  let liquid = 0;
  let productive = 0;
  let card = 0;
  for (const p of positions) {
    if (p.asset.liquid) liquid += p.currentValueMinor;
    else productive += p.currentValueMinor;
    if (p.asset.type === 'card') card += p.currentValueMinor;
  }
  const debts = liabilities.filter((l) => !l.deleted).reduce((sum, l) => sum + l.balanceMinor, 0);
  return {
    liquidMinor: liquid,
    productiveMinor: productive,
    liabilitiesMinor: debts,
    netWorthMinor: liquid + productive - debts,
    waitingToInvestMinor: Math.max(card - reserveMinor, 0),
  };
}
