import { Feather } from '@expo/vector-icons';
import { defaultCategory, type TransactionType } from '@invest/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from '../src/components/ui';
import { syncNow } from '../src/records';
import { formatSum } from '../src/records/format';
import { usePendingCount, useRecords, useTransactions } from '../src/records/hooks';
import type { LocalTransaction } from '../src/records/store';
import { radius, size, space, text, theme } from '../src/theme/tokens';

const FILTERS: (TransactionType | 'all')[] = [
  'all',
  'expense',
  'income_active',
  'income_passive',
  'investment',
  'dividend',
];

const OUTGOING: TransactionType[] = ['expense', 'investment'];

type Row = { kind: 'day'; day: string } | { kind: 'record'; record: LocalTransaction };

function groupByDay(records: LocalTransaction[]): Row[] {
  const rows: Row[] = [];
  let day = '';
  for (const record of records) {
    if (record.occurredOn !== day) {
      day = record.occurredOn;
      rows.push({ kind: 'day', day });
    }
    rows.push({ kind: 'record', record });
  }
  return rows;
}

export default function History() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const records = useTransactions(filter === 'all' ? {} : { type: filter });
  const custom = useRecords('category').data ?? [];
  const pending = usePendingCount().data ?? 0;

  function categoryLabel(ref: string | null, type: TransactionType): string {
    if (!ref) return t(`types.${type}`);
    if (defaultCategory(ref)) return t(`categories.${ref}`);
    return custom.find((c) => c.clientId === ref)?.name ?? t(`types.${type}`);
  }

  function dayLabel(day: string): string {
    return new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  }

  async function refresh() {
    setRefreshing(true);
    await syncNow();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <IconButton icon="chevron-left" label={t('common.back')} onPress={() => router.back()} />
        <Text style={[text.title, { color: theme.text, flex: 1 }]} accessibilityRole="header">
          {t('history.title')}
        </Text>
        <IconButton icon="plus" label={t('history.add')} onPress={() => router.push('/entry')} />
      </View>

      <Text
        style={[text.small, styles.status, { color: pending ? theme.warningText : theme.muted }]}
        accessibilityLiveRegion="polite"
      >
        {pending ? `${t('history.pending')}: ${pending}` : t('history.synced')}
      </Text>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: filter === item }}
            onPress={() => setFilter(item)}
            style={[styles.filter, filter === item && styles.filterActive]}
          >
            <Text style={[text.label, { color: filter === item ? theme.onPrimary : theme.text }]}>
              {item === 'all' ? t('history.all') : t(`types.${item}`)}
            </Text>
          </Pressable>
        )}
      />

      <FlatList
        data={groupByDay(records.data ?? [])}
        keyExtractor={(row) => (row.kind === 'day' ? `d-${row.day}` : row.record.clientId)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          records.isLoading ? undefined : (
            <Text style={[text.body, styles.empty]}>{t('history.empty')}</Text>
          )
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'day') {
            return <Text style={[text.label, styles.day]}>{dayLabel(row.day)}</Text>;
          }
          const r = row.record;
          const outgoing = OUTGOING.includes(r.type);
          const label = categoryLabel(r.category, r.type);
          const amount = `${formatSum(r.amountMinor, outgoing ? '-' : '+')} ${t('common.sum')}`;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${amount}${r.syncStatus !== 'synced' ? `, ${t('history.pending')}` : ''}`}
              onPress={() => router.push({ pathname: '/entry', params: { id: r.clientId } })}
              style={styles.item}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[text.body, { color: theme.text, fontFamily: 'Inter_600SemiBold' }]}>
                  {r.note || label}
                </Text>
                <Text style={[text.small, { color: theme.textSecondary }]}>
                  {r.note ? `${label} · ` : ''}
                  {r.necessity ? t(`necessity.${r.necessity}`) : t(`types.${r.type}`)}
                </Text>
              </View>
              <Text
                style={[text.label, { fontSize: 16, color: outgoing ? theme.text : theme.primary }]}
              >
                {formatSum(r.amountMinor, outgoing ? '-' : '+')}
              </Text>
              {r.syncStatus === 'pending' ? (
                <Feather name="upload-cloud" size={16} color={theme.warningText} />
              ) : r.syncStatus === 'rejected' ? (
                <Feather name="alert-circle" size={16} color={theme.danger} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  status: { paddingHorizontal: space.lg, paddingTop: space.sm },
  filters: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  filter: {
    minHeight: size.touch,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    justifyContent: 'center',
  },
  filterActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  day: { color: theme.textSecondary, paddingTop: space.md, paddingBottom: space.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
  },
  empty: { color: theme.muted, textAlign: 'center', paddingTop: space.xxl },
});
