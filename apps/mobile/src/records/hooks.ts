import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getStore, onRecordsChanged, pendingCount, syncNow } from '.';
import type { TransactionFilter } from './store';

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
    if (!enabled) return;
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

export function useTransaction(clientId: string | undefined) {
  return useQuery({
    queryKey: ['records', 'transaction', clientId],
    enabled: !!clientId,
    queryFn: async () => (await getStore()).getTransaction(clientId!),
  });
}

export function useCustomCategories() {
  return useQuery({
    queryKey: ['records', 'categories'],
    queryFn: async () => (await getStore()).listCategories(),
  });
}

export function usePendingCount() {
  return useQuery({ queryKey: ['records', 'pending'], queryFn: pendingCount });
}
