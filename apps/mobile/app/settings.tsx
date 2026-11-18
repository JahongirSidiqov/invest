import { DEFAULT_SETTINGS, type Settings } from '@invest/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../src/api';
import { Button, ErrorText, IconButton, Screen, Subtitle } from '../src/components/ui';
import { groupDigits, parseSumInput } from '../src/records/format';
import { radius, size, space, text, theme } from '../src/theme/tokens';

export default function SettingsScreen() {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => ((await api.GET('/v1/me/settings')).data as Settings) ?? DEFAULT_SETTINGS,
  });
  if (!settings.data) return null;
  return <SettingsForm initial={settings.data} onSaved={() => void settings.refetch()} />;
}

function SettingsForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [reserve, setReserve] = useState(groupDigits(String(initial.reserveMinor / 100)));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const reserveMinor = reserve.replace(/\D/g, '') === '0' ? 0 : parseSumInput(reserve);
    if (reserveMinor === null) return setError(t('entry.errors.amount'));
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.PUT('/v1/me/settings', {
        body: { ...initial, reserveMinor },
      });
      if (data) {
        setMessage(t('settings.saved'));
        onSaved();
      } else setError(t('common.error'));
    } catch {
      setError(t('common.offline'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen footer={<Button label={t('entry.save')} onPress={save} loading={busy} />}>
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
