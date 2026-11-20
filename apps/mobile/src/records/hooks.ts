import {
  assetPositions,
  computeStage,
  kpis,
  monthTotals,
  type Onboarding,
  shiftMonth,
  type SyncEntity,
  wealthSummary,
} from '@invest/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getSettings, getStore, onRecordsChanged, pendingCount, syncNow } from '.';
import { LOCAL_MODE } from '../config';
import { localDate } from './format';
import type { RecordStore, TransactionFilter } from './store';

/** Re-reads local queries whenever records change locally or arrive from the server. */
export function useRecordsInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(
    () => onRecordsChanged(() => void queryClient.invalidateQueries({ queryKey: ['records'] })),
    [queryClient],
  );
}

/** Syncs on start, when the app returns to the foreground and when the network comes back. */
export function useAutoSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || LOCAL_MODE) return;
    void syncNow();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    const net = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable) void syncNow();
    });
    return () => {
      app.remove();
      net.remove();
    };
  }, [enabled]);
}

export function useTransactions(filter: TransactionFilter = {}) {
  return useQuery({
    queryKey: ['records', 'transactions', filter],
    queryFn: async () => (await getStore()).listTransactions(filter),
  });
}

export function useRecord<E extends SyncEntity>(entity: E, clientId: string | undefined) {
  return useQuery({
    queryKey: ['records', entity, 'one', clientId],
    enabled: !!clientId,
    queryFn: async () => (await getStore()).get(entity, clientId!),
  });
}

export function useRecords<E extends SyncEntity>(entity: E) {
  return useQuery({
    queryKey: ['records', entity, 'all'],
    queryFn: async () => (await getStore()).list(entity),
  });
}

export function usePendingCount() {
  return useQuery({ queryKey: ['records', 'pending'], queryFn: pendingCount });
}

export function useSettings() {
  return useQuery({ queryKey: ['records', 'settings'], queryFn: getSettings });
}

async function computeWealth(store: RecordStore) {
  const [assets, valuations, liabilities, investments, dividends, settings] = await Promise.all([
    store.list('asset'),
    store.list('valuation'),
    store.list('liability'),
    store.listTransactions({ type: 'investment' }),
    store.listTransactions({ type: 'dividend' }),
    getSettings(),
  ]);
  const positions = assetPositions(assets, valuations, [...investments, ...dividends]);
  return {
    positions,
    liabilities,
    summary: wealthSummary(positions, liabilities, settings.reserveMinor),
  };
}

/** Asset positions and net worth, computed on the phone with the shared code. */
export function useWealth() {
  return useQuery({
    queryKey: ['records', 'wealth'],
    queryFn: async () => computeWealth(await getStore()),
  });
}

export async function readOnboarding(store: RecordStore): Promise<Onboarding> {
  const raw = await store.getMeta('onboarding');
  const parsed = raw ? (JSON.parse(raw) as Partial<Onboarding>) : {};
  return { savingsMinor: parsed.savingsMinor ?? null, spendingMinor: parsed.spendingMinor ?? null };
}

/** Stage, home KPIs and this month's totals (docs/FINANCE_MODEL.md). */
export function useOverview() {
  return useQuery({
    queryKey: ['records', 'overview'],
    queryFn: async () => {
      const store = await getStore();
      const currentMonth = localDate().slice(0, 7);
      const [transactions, wealth, onboarding] = await Promise.all([
        store.listTransactions({ from: `${shiftMonth(currentMonth, 3)}-01` }),
        computeWealth(store),
        readOnboarding(store),
      ]);
      const stage = computeStage({
        transactions,
        currentMonth,
        liquidMinor: wealth.summary.liquidMinor,
        productiveMinor: wealth.summary.productiveMinor,
        onboarding,
      });
      const month = monthTotals(transactions, currentMonth);
      const previous = monthTotals(transactions, shiftMonth(currentMonth, 1));
      return {
        stage,
        month,
        wealth: wealth.summary,
        kpis: kpis(
          previous.records > 0 ? previous : month,
          stage.status === 'no_data' ? null : stage.inputs,
        ),
      };
    },
  });
}
