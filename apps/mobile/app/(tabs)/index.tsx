import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Screen, Title } from '../../src/components/ui';
import { formatSum } from '../../src/records/format';
import { useTransactions } from '../../src/records/hooks';
import { radius, size, space, text, theme } from '../../src/theme/tokens';

/** Phase 2 home: quick actions and the latest records. Stage card and KPIs arrive in phase 4. */
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const recent = useTransactions({ limit: 5 }).data ?? [];

  return (
    <Screen>
      <Title>{t('tabs.home')}</Title>
      <Button label={t('entry.title')} onPress={() => router.push('/entry')} />

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
          <View key={r.clientId} style={styles.row}>
            <Text style={[text.body, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {r.note ||
                (r.category ? t(`categories.${r.category}`, r.category) : t(`types.${r.type}`))}
            </Text>
            <Text style={[text.label, { color: outgoing ? theme.text : theme.primary }]}>
              {formatSum(r.amountMinor, outgoing ? '-' : '+')}
            </Text>
          </View>
        );
      })}
    </Screen>
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
      <Text style={[text.label, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
