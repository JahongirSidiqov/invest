import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, IconButton, Screen } from '../src/components/ui';
import { formatSum } from '../src/records/format';
import { useWealth } from '../src/records/hooks';
import { radius, size, space, text, theme } from '../src/theme/tokens';

function Sum({ value, sign = '' }: { value: number; sign?: '+' | '-' | '' }) {
  const { t } = useTranslation();
  return (
    <Text>
      {formatSum(value, sign)} {t('common.sum')}
    </Text>
  );
}

/** Net worth, liquid savings, investments and debts (docs/FINANCE_MODEL.md §3). */
export default function Assets() {
  const { t } = useTranslation();
  const router = useRouter();
  const wealth = useWealth().data;
  if (!wealth) return null;
  const { summary, positions, liabilities } = wealth;

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={t('assets.add')} onPress={() => router.push('/asset-form')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('assets.addDebt')}
              variant="secondary"
              onPress={() => router.push('/liability-form')}
            />
          </View>
        </View>
      }
    >
      <View style={styles.header}>
        <IconButton icon="chevron-left" label={t('common.back')} onPress={() => router.back()} />
        <Text style={[text.title, { color: theme.text }]} accessibilityRole="header">
          {t('assets.title')}
        </Text>
      </View>

      <View style={styles.hero}>
        <Text style={[text.label, { color: theme.primarySoft }]}>{t('assets.netWorth')}</Text>
        <Text style={[text.display, { color: theme.onPrimary }]}>
          <Sum
            value={Math.abs(summary.netWorthMinor)}
            sign={summary.netWorthMinor < 0 ? '-' : ''}
          />
        </Text>
        <View style={styles.heroRow}>
          <Stat label={t('assets.liquid')} value={summary.liquidMinor} />
          <Stat label={t('assets.invested')} value={summary.productiveMinor} />
          <Stat label={t('assets.debts')} value={summary.liabilitiesMinor} />
        </View>
      </View>

      {summary.waitingToInvestMinor > 0 ? (
        <View style={styles.notice}>
          <Text style={[text.body, { color: theme.primaryDark }]}>
            {t('assets.waiting')}: <Sum value={summary.waitingToInvestMinor} />
          </Text>
        </View>
      ) : null}

      {positions.length === 0 ? (
        <Text style={[text.body, { color: theme.muted }]}>{t('assets.empty')}</Text>
      ) : null}

      {positions.map((p) => (
        <Pressable
          key={p.asset.clientId}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/asset-form', params: { id: p.asset.clientId } })}
          style={styles.card}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[text.body, { color: theme.text, fontFamily: 'Inter_600SemiBold' }]}>
              {p.asset.name}
            </Text>
            <Text style={[text.small, { color: theme.textSecondary }]}>
              {t(`assetTypes.${p.asset.type}`)} · {t('assets.investedShort')}{' '}
              {formatSum(p.investedMinor)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={[text.label, { color: theme.text, fontSize: 16 }]}>
              {formatSum(p.currentValueMinor)}
            </Text>
            {p.roi !== null ? (
              <Text
                style={[text.small, { color: p.gainMinor >= 0 ? theme.primary : theme.dangerText }]}
              >
                {p.gainMinor >= 0 ? '+' : ''}
                {(p.roi * 100).toFixed(1)}%
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}

      {liabilities.length > 0 ? (
        <Text style={[text.label, { color: theme.textSecondary }]}>{t('assets.debts')}</Text>
      ) : null}
      {liabilities.map((l) => (
        <Pressable
          key={l.clientId}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/liability-form', params: { id: l.clientId } })}
          style={styles.card}
        >
          <Text style={[text.body, { color: theme.text, flex: 1 }]}>{l.name}</Text>
          <Text style={[text.label, { color: theme.dangerText }]}>
            {formatSum(l.balanceMinor, '-')}
          </Text>
        </Pressable>
      ))}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[text.small, { color: theme.primarySoft }]}>{label}</Text>
      <Text style={[text.label, { color: theme.onPrimary }]}>{formatSum(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hero: {
    backgroundColor: theme.primaryDark,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  heroRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  notice: { backgroundColor: theme.primarySoft, borderRadius: radius.md, padding: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  touch: { minHeight: size.touch },
});
