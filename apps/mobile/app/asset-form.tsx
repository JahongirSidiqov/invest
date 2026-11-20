import {
  ASSET_TYPES,
  type AssetType,
  DIVIDEND_METHODS,
  type DividendMethod,
  LIQUID_BY_DEFAULT,
  type SyncAsset,
} from '@invest/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Chip, ChipRow, Label, SumInput, SwitchRow, TextField } from '../src/components/form';
import { Button, ErrorText, IconButton, Screen, Subtitle } from '../src/components/ui';
import { deleteRecord, newClientId, now, saveRecord } from '../src/records';
import { groupDigits, localDate, parseSumInput } from '../src/records/format';
import { useRecord, useWealth } from '../src/records/hooks';
import { space, text, theme } from '../src/theme/tokens';

/** Card and cash have no dividends; everything else may. */
const NO_DIVIDENDS: ReadonlySet<AssetType> = new Set(['card', 'cash']);

export default function AssetFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const asset = useRecord('asset', params.id);
  const wealth = useWealth();
  if (params.id && (!asset.data || !wealth.data)) return null;
  const position = wealth.data?.positions.find((p) => p.asset.clientId === params.id);
  return (
    <AssetForm
      key={params.id ?? 'new'}
      existing={asset.data ?? null}
      currentValueMinor={position?.currentValueMinor ?? null}
    />
  );
}

function AssetForm({
  existing,
  currentValueMinor,
}: {
  existing: SyncAsset | null;
  currentValueMinor: number | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [type, setType] = useState<AssetType>(existing?.type ?? 'iman');
  const [name, setName] = useState(existing?.name ?? '');
  const [liquid, setLiquid] = useState(existing?.liquid ?? LIQUID_BY_DEFAULT.has('iman'));
  const [method, setMethod] = useState<DividendMethod | null>(
    existing?.dividendMethod ?? 'withdraw',
  );
  const [opening, setOpening] = useState(
    existing ? groupDigits(String(existing.openingInvestedMinor / 100)) : '',
  );
  const initialValue =
    currentValueMinor === null ? '' : groupDigits(String(currentValueMinor / 100));
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  function pickType(next: AssetType) {
    setType(next);
    setLiquid(LIQUID_BY_DEFAULT.has(next));
    setMethod(NO_DIVIDENDS.has(next) ? null : (method ?? 'withdraw'));
    if (!name || ASSET_TYPES.some((a) => t(`assetTypes.${a}`) === name)) {
      setName(t(`assetTypes.${next}`));
    }
  }

  async function save() {
    const finalName = name.trim() || t(`assetTypes.${type}`);
    const openingMinor = opening.replace(/\D/g, '') ? (parseSumInput(opening) ?? 0) : 0;
    const valueMinor = value.replace(/\D/g, '') === '0' ? 0 : parseSumInput(value);
    if (valueMinor === null) return setError(t('assets.errors.value'));

    const record: SyncAsset = {
      clientId: existing?.clientId ?? newClientId(),
      type,
      name: finalName,
      liquid,
      dividendMethod: NO_DIVIDENDS.has(type) ? null : method,
      openingInvestedMinor: existing ? existing.openingInvestedMinor : openingMinor || valueMinor,
      openedOn: existing?.openedOn ?? localDate(),
      note: existing?.note ?? null,
      clientUpdatedAt: now(),
      deleted: false,
    };
    if (existing) record.openingInvestedMinor = openingMinor;
    await saveRecord('asset', record);

    // A changed value is a new dated valuation, which keeps the history.
    if (value !== initialValue) {
      await saveRecord('valuation', {
        clientId: newClientId(),
        asset: record.clientId,
        valueMinor,
        valuedOn: localDate(),
        clientUpdatedAt: now(),
        deleted: false,
      });
    }
    router.back();
  }

  async function remove() {
    if (!existing) return;
    await deleteRecord('asset', existing);
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
          {existing ? t('assets.edit') : t('assets.add')}
        </Text>
      </View>

      <Label>{t('assets.type')}</Label>
      <ChipRow>
        {ASSET_TYPES.map((a) => (
          <Chip
            key={a}
            label={t(`assetTypes.${a}`)}
            selected={type === a}
            onPress={() => pickType(a)}
          />
        ))}
      </ChipRow>

      <Label>{t('assets.name')}</Label>
      <TextField
        label={t('assets.name')}
        value={name}
        onChange={setName}
        placeholder={t(`assetTypes.${type}`)}
      />

      <Label>{t('assets.currentValue')}</Label>
      <SumInput
        label={t('assets.currentValue')}
        value={value}
        onChange={setValue}
        unit={t('common.sum')}
      />

      <Label>{t('assets.openingInvested')}</Label>
      <SumInput
        label={t('assets.openingInvested')}
        value={opening}
        onChange={setOpening}
        unit={t('common.sum')}
      />
      <Subtitle>{t('assets.openingHint')}</Subtitle>

      <SwitchRow label={t('assets.liquidToggle')} value={liquid} onChange={setLiquid} />

      {!NO_DIVIDENDS.has(type) ? (
        <>
          <Label>{t('assets.dividendMethod')}</Label>
          <ChipRow>
            {DIVIDEND_METHODS.map((m) => (
              <Chip
                key={m}
                label={t(`assets.methods.${m}`)}
                selected={method === m}
                onPress={() => setMethod(m)}
              />
            ))}
          </ChipRow>
        </>
      ) : null}
    </Screen>
  );
}
