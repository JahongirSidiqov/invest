import { LIABILITY_KINDS, type SyncLiability } from '@invest/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Chip, ChipRow, Label, SumInput, TextField } from '../src/components/form';
import { Button, ErrorText, IconButton, Screen } from '../src/components/ui';
import { deleteRecord, newClientId, now, saveRecord } from '../src/records';
import { groupDigits, parseSumInput } from '../src/records/format';
import { useRecord } from '../src/records/hooks';
import { space, text, theme } from '../src/theme/tokens';

type Kind = SyncLiability['kind'];

export default function LiabilityFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const liability = useRecord('liability', params.id);
  if (params.id && !liability.data) return null;
  return <LiabilityForm key={params.id ?? 'new'} existing={liability.data ?? null} />;
}

function LiabilityForm({ existing }: { existing: SyncLiability | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(existing?.kind ?? 'nasiya');
  const [name, setName] = useState(existing?.name ?? '');
  const [balance, setBalance] = useState(
    existing ? groupDigits(String(existing.balanceMinor / 100)) : '',
  );
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const balanceMinor = balance.replace(/\D/g, '') === '0' ? 0 : parseSumInput(balance);
    if (balanceMinor === null) return setError(t('entry.errors.amount'));
    await saveRecord('liability', {
      clientId: existing?.clientId ?? newClientId(),
      kind,
      name: name.trim() || t(`liabilityKinds.${kind}`),
      balanceMinor,
      note: existing?.note ?? null,
      clientUpdatedAt: now(),
      deleted: false,
    });
    router.back();
  }

  async function remove() {
    if (!existing) return;
    await deleteRecord('liability', existing);
    router.back();
  }

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button label={t('entry.save')} onPress={save} />
          {existing ? (
            <Button label={t('entry.delete')} variant="secondary" onPress={remove} />
          ) : null}
        </>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconButton icon="x" label={t('common.back')} onPress={() => router.back()} />
        <Text style={[text.title, { color: theme.text }]} accessibilityRole="header">
          {t('assets.addDebt')}
        </Text>
      </View>

      <Label>{t('assets.type')}</Label>
      <ChipRow>
        {LIABILITY_KINDS.map((k) => (
          <Chip
            key={k}
            label={t(`liabilityKinds.${k}`)}
            selected={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
      </ChipRow>

      <Label>{t('assets.name')}</Label>
      <TextField
        label={t('assets.name')}
        value={name}
        onChange={setName}
        placeholder={t(`liabilityKinds.${kind}`)}
      />

      <Label>{t('assets.balance')}</Label>
      <SumInput
        label={t('assets.balance')}
        value={balance}
        onChange={setBalance}
        unit={t('common.sum')}
      />
    </Screen>
  );
}
