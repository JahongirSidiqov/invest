import { describe, expect, it } from 'vitest';
import type { SyncAsset, SyncLiability, SyncTransaction, SyncValuation } from '../records';
import { assetPositions, wealthSummary } from './assets';

const T = '2026-11-18T08:00:00.000Z';
let n = 0;
const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const mln = (x: number) => x * 1_000_000 * 100; // so'm millions -> tiyin

function asset(over: Partial<SyncAsset>): SyncAsset {
  return {
    clientId: id(),
    type: 'asaxiy',
    name: 'Asaxiy',
    liquid: false,
    dividendMethod: 'withdraw',
    openingInvestedMinor: 0,
    openedOn: '2026-01-01',
    note: null,
    clientUpdatedAt: T,
    deleted: false,
    ...over,
  };
}

function tx(over: Partial<SyncTransaction>): SyncTransaction {
  return {
    clientId: id(),
    type: 'investment',
    amountMinor: 0,
    currency: 'UZS',
    category: null,
    necessity: null,
    asset: null,
    capitalised: null,
    occurredOn: '2026-02-01',
    note: null,
    source: 'manual',
    clientUpdatedAt: T,
    deleted: false,
    ...over,
  };
}

function valuation(assetId: string, valueMinor: number, valuedOn: string): SyncValuation {
  return {
    clientId: id(),
    asset: assetId,
    valueMinor,
    valuedOn,
    clientUpdatedAt: T,
    deleted: false,
  };
}

describe('assetPositions', () => {
  it('starts from the opening amount when there is no valuation', () => {
    const a = asset({ openingInvestedMinor: mln(10) });
    const [p] = assetPositions([a], [], []);
    expect(p).toMatchObject({ currentValueMinor: mln(10), investedMinor: mln(10), gainMinor: 0 });
    expect(p!.roi).toBe(0);
  });

  it('adds investments and capitalised dividends made after the last valuation', () => {
    const a = asset({ openingInvestedMinor: mln(10), dividendMethod: 'capitalise' });
    const rows = [
      tx({ asset: a.clientId, amountMinor: mln(2), occurredOn: '2026-02-01' }), // before valuation
      tx({ asset: a.clientId, amountMinor: mln(1), occurredOn: '2026-04-01' }), // after
      tx({
        asset: a.clientId,
        type: 'dividend',
        capitalised: true,
        amountMinor: mln(0.5),
        occurredOn: '2026-04-15',
      }),
    ];
    const [p] = assetPositions([a], [valuation(a.clientId, mln(12.6), '2026-03-31')], rows);
    expect(p!.investedMinor).toBe(mln(13));
    expect(p!.currentValueMinor).toBe(mln(12.6) + mln(1) + mln(0.5));
    expect(p!.capitalisedDividendsMinor).toBe(mln(0.5));
    expect(p!.gainMinor).toBe(mln(14.1) - mln(13));
  });

  it('counts withdrawn dividends in the gain but not in the value', () => {
    const a = asset({ openingInvestedMinor: mln(20) });
    const rows = [
      tx({ asset: a.clientId, type: 'dividend', capitalised: false, amountMinor: mln(0.6) }),
    ];
    const [p] = assetPositions([a], [valuation(a.clientId, mln(20), '2026-01-31')], rows);
    expect(p!.currentValueMinor).toBe(mln(20));
    expect(p!.withdrawnDividendsMinor).toBe(mln(0.6));
    expect(p!.roi).toBeCloseTo(0.03, 10);
  });

  it('uses the latest valuation and ignores deleted rows', () => {
    const a = asset({ openingInvestedMinor: mln(5) });
    const old = valuation(a.clientId, mln(5.1), '2026-02-01');
    const latest = valuation(a.clientId, mln(5.4), '2026-03-01');
    const gone = { ...valuation(a.clientId, mln(99), '2026-04-01'), deleted: true };
    const [p] = assetPositions([a], [latest, old, gone], []);
    expect(p!.currentValueMinor).toBe(mln(5.4));
    expect(assetPositions([{ ...a, deleted: true }], [], [])).toEqual([]);
  });
});

describe('wealthSummary', () => {
  it('splits liquid and productive, subtracts debts and finds money waiting to be invested', () => {
    const card = asset({
      type: 'card',
      name: 'Humo',
      liquid: true,
      openingInvestedMinor: mln(3.2),
    });
    const deposit = asset({ type: 'bank_deposit', liquid: true, openingInvestedMinor: mln(15) });
    const iman = asset({ type: 'iman', name: 'Iman', openingInvestedMinor: mln(40) });
    const debt: SyncLiability = {
      clientId: id(),
      kind: 'nasiya',
      name: 'Telefon',
      balanceMinor: mln(4),
      note: null,
      clientUpdatedAt: T,
      deleted: false,
    };
    const positions = assetPositions([card, deposit, iman], [], []);
    expect(wealthSummary(positions, [debt], mln(1))).toEqual({
      liquidMinor: mln(18.2),
      productiveMinor: mln(40),
      liabilitiesMinor: mln(4),
      netWorthMinor: mln(54.2),
      waitingToInvestMinor: mln(2.2),
    });
  });

  it('never reports negative money waiting to be invested', () => {
    const card = asset({ type: 'card', liquid: true, openingInvestedMinor: mln(0.4) });
    expect(wealthSummary(assetPositions([card], [], []), [], mln(1)).waitingToInvestMinor).toBe(0);
  });
});
