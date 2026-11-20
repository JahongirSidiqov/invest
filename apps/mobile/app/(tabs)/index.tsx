import { Feather } from '@expo/vector-icons';
import { FULL_DATA_MONTHS } from '@invest/shared';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, Title } from '../../src/components/ui';
import { formatSum } from '../../src/records/format';
import { useOverview, useTransactions } from '../../src/records/hooks';
import { radius, size, space, text, theme } from '../../src/theme/tokens';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** Home: stage card, the five home KPIs, this month, quick actions, recent records. */
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const overview = useOverview().data;
  const recent = useTransactions({ limit: 5 }).data ?? [];

  const stage = overview?.stage;
  const sum = (minor: number) => `${formatSum(minor)} ${t('common.sum')}`;

  function missingText(): string | null {
    if (!stage || stage.status === 'no_data') return null;
    const m = stage.missing;
    if (!m) return t('stage.done');
    if ('savingsMinor' in m) {
      const parts = [];
      if (m.savingsMinor > 0)
        parts.push(t('stage.needSavings', { amount: formatSum(m.savingsMinor) }));
      if (m.needsPassiveSource) parts.push(t('stage.needPassiveSource'));
      return parts.join('\n');
    }
    return t('stage.needMonthly', { amount: formatSum(m.monthlyMinor) });
  }

  return (
    <Screen>
      <Title>{t('tabs.home')}</Title>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/assets')}
        style={styles.stageCard}
      >
        <Text style={[text.label, { color: theme.primarySoft }]}>{t('stage.title')}</Text>
        {stage && stage.status !== 'no_data' ? (
          <>
            <View style={styles.stageRow}>
              <Text style={[text.display, { color: theme.onPrimary }]}>{stage.stage}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[text.title, { color: theme.onPrimary, fontSize: 20 }]}>
                  {t(`stage.names.${stage.stage}`)}
                </Text>
                {stage.status === 'provisional' ? (
                  <Text style={[text.small, styles.badge]}>{t('stage.provisional')}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.steps}>
              {[1, 2, 3, 4, 5].map((s) => (
                <View key={s} style={[styles.step, s <= stage.stage && styles.stepDone]} />
              ))}
            </View>
            <Text style={[text.body, { color: theme.onPrimary }]}>{missingText()}</Text>
            {stage.status === 'provisional' ? (
              <Text style={[text.small, { color: theme.primarySoft }]}>
                {t('stage.provisionalHint', { count: FULL_DATA_MONTHS - stage.monthsOfData })}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[text.body, { color: theme.onPrimary }]}>{t('stage.noData')}</Text>
        )}
      </Pressable>

      {overview ? (
        <View style={styles.grid}>
          <Kpi label={t('kpi.netWorth')} value={sum(overview.wealth.netWorthMinor)} wide />
          <Kpi label={t('kpi.savingsRate')} value={pct(overview.kpis.savingsRate)} />
          <Kpi
            label={t('kpi.emergency')}
            value={
              overview.kpis.emergencyMonths === null
                ? '—'
                : t('kpi.emergencyValue', { value: overview.kpis.emergencyMonths.toFixed(1) })
            }
          />
          <Kpi label={t('kpi.passive')} value={pct(overview.kpis.passiveCoverage)} />
          <Kpi label={t('kpi.investShare')} value={pct(overview.kpis.investmentShare)} />
        </View>
      ) : null}

      {overview ? (
        <View style={styles.month}>
          <Text style={[text.label, { color: theme.textSecondary }]}>{t('kpi.month')}</Text>
          <View style={styles.monthRow}>
            <Text style={[text.body, { color: theme.text, flex: 1 }]}>{t('kpi.income')}</Text>
            <Text style={[text.label, { color: theme.primary }]}>
              {formatSum(overview.month.incomeMinor, '+')}
            </Text>
          </View>
          <View style={styles.monthRow}>
            <Text style={[text.body, { color: theme.text, flex: 1 }]}>{t('kpi.expense')}</Text>
            <Text style={[text.label, { color: theme.text }]}>
              {formatSum(overview.month.expenseMinor, '-')}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.links}>
        <Link icon="plus-circle" label={t('entry.title')} onPress={() => router.push('/entry')} />
        <Link icon="briefcase" label={t('assets.title')} onPress={() => router.push('/assets')} />
      </View>
      <View style={styles.links}>
        <Link icon="list" label={t('history.title')} onPress={() => router.push('/history')} />
        <Link
          icon="settings"
          label={t('settings.title')}
          onPress={() => router.push('/settings')}
        />
      </View>

      {recent.map((r) => {
        const outgoing = r.type === 'expense' || r.type === 'investment';
        return (
          <Pressable
            key={r.clientId}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/entry', params: { id: r.clientId } })}
            style={styles.row}
          >
            <Text style={[text.body, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {r.note ||
                (r.category ? t(`categories.${r.category}`, r.category) : t(`types.${r.type}`))}
            </Text>
            <Text style={[text.label, { color: outgoing ? theme.text : theme.primary }]}>
              {formatSum(r.amountMinor, outgoing ? '-' : '+')}
            </Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}

function Kpi({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View
      style={[styles.kpi, wide && styles.kpiWide]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[text.small, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[text.label, { color: theme.text, fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

function Link({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Feather name={icon} size={20} color={theme.primary} />
      <Text style={[text.label, { color: theme.text, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stageCard: {
    backgroundColor: theme.primaryDark,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    color: theme.warningText,
    backgroundColor: theme.warningBg,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  steps: { flexDirection: 'row', gap: space.xs },
  step: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: theme.primary },
  stepDone: { backgroundColor: theme.primarySoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 64,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 2,
  },
  kpiWide: { flexBasis: '100%' },
  month: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    gap: space.xs,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  links: { flexDirection: 'row', gap: space.sm },
  link: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: size.button,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.touch,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
  },
});
