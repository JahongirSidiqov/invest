import type { Settings } from '@invest/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, ErrorText, IconButton, Screen, Subtitle } from '../src/components/ui';
import { saveSettings } from '../src/records';
import { groupDigits, parseSumInput } from '../src/records/format';
import { useSettings } from '../src/records/hooks';
import { useSession } from '../src/state/session';
import { radius, size, space, text, theme } from '../src/theme/tokens';

export default function SettingsScreen() {
  const settings = useSettings();
  if (!settings.data) return null;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const { t } = useTranslation();
  const router = useRouter();
  const signOut = useSession((s) => s.signOut);
  const [reserve, setReserve] = useState(groupDigits(String(initial.reserveMinor / 100)));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const reserveMinor = reserve.replace(/\D/g, '') === '0' ? 0 : parseSumInput(reserve);
    if (reserveMinor === null) return setError(t('entry.errors.amount'));
    setError(null);
    await saveSettings({ ...initial, reserveMinor });
    setMessage(t('settings.saved'));
  }

  return (
    <Screen
      footer={
        <>
          <Button label={t('entry.save')} onPress={save} />
          <Button
            label={t('settings.signOut')}
            variant="secondary"
            onPress={() => void signOut()}
          />
        </>
      }
    >
      <View style={styles.header}>
        <IconButton icon="chevron-left" label={t('common.back')} onPress={() => router.back()} />
        <Text style={[text.title, { color: theme.text }]} accessibilityRole="header">
          {t('settings.title')}
        </Text>
      </View>

      <Text style={[text.label, { color: theme.textSecondary }]}>{t('settings.reserve')}</Text>
      <View style={styles.input}>
        <TextInput
          accessibilityLabel={t('settings.reserve')}
          value={reserve}
          onChangeText={(v) => {
            setReserve(groupDigits(v));
            setMessage(null);
          }}
          keyboardType="number-pad"
          style={[text.title, { flex: 1, color: theme.text }]}
        />
        <Text style={[text.body, { color: theme.textSecondary }]}>{t('common.sum')}</Text>
      </View>
      <Subtitle>{t('settings.reserveHint')}</Subtitle>
      <ErrorText>{error}</ErrorText>
      {message ? <Text style={[text.small, { color: theme.primary }]}>{message}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: space.md,
  },
});
