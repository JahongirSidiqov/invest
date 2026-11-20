import {
  type CategoryKind,
  DEFAULT_CATEGORIES,
  defaultCategory,
  NECESSITY,
  type Necessity,
  type SyncTransaction,
  type TransactionType,
} from '@invest/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, ErrorText, IconButton, Screen } from '../src/components/ui';
import { deleteRecord, newClientId, saveRecord } from '../src/records';
import { formatSum, groupDigits, localDate, parseSumInput } from '../src/records/format';
import { useRecord, useRecords } from '../src/records/hooks';
import { radius, size, space, text, theme } from '../src/theme/tokens';

type Tab = 'expense' | 'income' | 'investment' | 'dividend';
const TABS: Tab[] = ['expense', 'income', 'investment', 'dividend'];

function tabOf(type: TransactionType): Tab {
  return type === 'income_active' || type === 'income_passive' ? 'income' : type;
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[text.label, { color: selected ? theme.onPrimary : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export default function Entry() {
  const params = useLocalSearchParams<{ id?: string }>();
  const record = useRecord('transaction', params.id);
  // Editing: wait for the record from the local store, then start the form with it.
  if (params.id && !record.data) return null;
  return (
    <EntryForm key={params.id ?? 'new'} existing={record.data ?? null} autoFocus={!params.id} />
  );
}

function EntryForm({
  existing,
  autoFocus,
}: {
  existing: SyncTransaction | null;
  autoFocus: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const customQuery = useRecords('category');
  const assetsQuery = useRecords('asset');
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data]);
  const [asset, setAsset] = useState<string | null>(existing?.asset ?? null);
  const [capitalised, setCapitalised] = useState<boolean>(existing?.capitalised ?? false);
  const custom = useMemo(() => customQuery.data ?? [], [customQuery.data]);

  const [tab, setTab] = useState<Tab>(existing ? tabOf(existing.type) : 'expense');
  const [passive, setPassive] = useState(existing?.type === 'income_passive');
  const [amountText, setAmountText] = useState(
    existing ? groupDigits(String(existing.amountMinor / 100)) : '',
  );
  const [category, setCategory] = useState<string | null>(existing?.category ?? null);
  const [necessity, setNecessity] = useState<Necessity | null>(existing?.necessity ?? null);
  const [occurredOn, setOccurredOn] = useState(existing?.occurredOn ?? localDate());
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const type: TransactionType =
    tab === 'income' ? (passive ? 'income_passive' : 'income_active') : tab;
  const kind: CategoryKind | null =
    type === 'expense' || type === 'income_active' || type === 'income_passive' ? type : null;

  const needsAsset = type === 'investment' || type === 'dividend';

  function pickAsset(id: string) {
    setAsset(id);
    setError(null);
    const picked = assets.find((a) => a.clientId === id);
    if (picked) setCapitalised(picked.dividendMethod === 'capitalise');
  }

  const categories = useMemo(() => {
    if (!kind) return [];
    return [
      ...DEFAULT_CATEGORIES.filter((c) => c.kind === kind).map((c) => ({
        ref: c.slug,
        label: t(`categories.${c.slug}`),
        necessity: c.necessity,
      })),
      ...custom
        .filter((c) => c.kind === kind)
        .map((c) => ({ ref: c.clientId, label: c.name, necessity: c.necessity })),
    ];
  }, [kind, custom, t]);

  function pickCategory(ref: string) {
    setCategory(ref);
    setError(null);
    const picked = categories.find((c) => c.ref === ref);
    if (type === 'expense' && picked?.necessity) setNecessity(picked.necessity);
  }

  function changeType(next: Tab, nextPassive = passive) {
    setTab(next);
    setPassive(nextPassive);
    setCategory(null);
    setNecessity(null);
  }

  async function save() {
    const amountMinor = parseSumInput(amountText);
    if (!amountMinor) return setError(t('entry.errors.amount'));
    if (kind && !category) return setError(t('entry.errors.category'));
    if (needsAsset && !asset) return setError(t('entry.errors.asset'));
    const builtIn = category ? defaultCategory(category) : undefined;
    const record: SyncTransaction = {
      clientId: existing?.clientId ?? newClientId(),
      type,
      amountMinor,
      currency: 'UZS',
      category: kind ? category : null,
      asset: needsAsset ? asset : null,
      capitalised: type === 'dividend' ? capitalised : null,
      necessity: type === 'expense' ? (necessity ?? builtIn?.necessity ?? 'moderate') : null,
      occurredOn,
      note: note.trim() || null,
      source: existing?.source ?? 'manual',
      clientUpdatedAt: new Date().toISOString(),
      deleted: false,
    };
    setBusy(true);
    try {
      await saveRecord('transaction', record);
      router.back();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    await deleteRecord('transaction', existing);
    router.back();
  }

  const amountMinor = parseSumInput(amountText);
  const dateChoices = [localDate(0), localDate(-1)];

  return (
    <Screen
      footer={
        <>
          <ErrorText>{error}</ErrorText>
          <Button label={t('entry.save')} onPress={save} loading={busy} />
          {existing ? (
            <Button label={t('entry.delete')} variant="secondary" onPress={remove} />
          ) : null}
        </>
      }
    >
      <View style={styles.header}>
        <IconButton icon="x" label={t('common.back')} onPress={() => router.back()} />
        <Text style={[text.label, { color: theme.text, fontSize: 18 }]} accessibilityRole="header">
          {existing ? t('entry.editTitle') : t('entry.title')}
        </Text>
        <View style={{ width: size.touch }} />
      </View>

      <View style={styles.segment} accessibilityRole="tablist">
        {TABS.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            onPress={() => changeType(item)}
            style={[styles.segmentItem, tab === item && styles.segmentActive]}
          >
            <Text style={[text.label, { color: tab === item ? theme.text : theme.textSecondary }]}>
              {t(`types.${item === 'income' ? 'income_active' : item}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'income' ? (
        <View style={styles.row}>
          <Text style={[text.body, { color: theme.text, flex: 1 }]}>{t('entry.passive')}</Text>
          <Switch
            accessibilityLabel={t('entry.passive')}
            value={passive}
            onValueChange={(v) => changeType('income', v)}
            trackColor={{ true: theme.primary, false: theme.border }}
          />
        </View>
      ) : null}

      <Text style={[text.label, { color: theme.textSecondary }]}>{t('entry.amount')}</Text>
      <View style={styles.amountRow}>
        <TextInput
          testID="amount-input"
          accessibilityLabel={t('entry.amount')}
          value={amountText}
          onChangeText={(v) => {
            setAmountText(groupDigits(v));
            setError(null);
          }}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.muted}
          style={[text.display, styles.amountInput]}
          autoFocus={autoFocus}
        />
        <Text style={[text.title, { color: theme.textSecondary }]}>{t('common.sum')}</Text>
      </View>
      {amountMinor ? (
        <Text style={[text.small, { color: theme.muted }]}>
          {formatSum(amountMinor, type === 'expense' || type === 'investment' ? '-' : '+')}{' '}
          {t('common.sum')}
        </Text>
      ) : null}

      {kind ? (
        <>
          <Text style={[text.label, { color: theme.textSecondary }]}>{t('entry.category')}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {categories.map((c) => (
              <Chip
                key={c.ref}
                label={c.label}
                selected={category === c.ref}
                onPress={() => pickCategory(c.ref)}
              />
            ))}
          </View>
        </>
      ) : null}

      {needsAsset ? (
        <>
          <Text style={[text.label, { color: theme.textSecondary }]}>{t('entry.asset')}</Text>
          {assets.length === 0 ? (
            <Button
              label={t('assets.add')}
              variant="secondary"
              onPress={() => router.push('/asset-form')}
            />
          ) : (
            <View style={styles.chips} accessibilityRole="radiogroup">
              {assets.map((a) => (
                <Chip
                  key={a.clientId}
                  label={a.name}
                  selected={asset === a.clientId}
                  onPress={() => pickAsset(a.clientId)}
                />
              ))}
            </View>
          )}
          {type === 'dividend' ? (
            <View style={styles.row}>
              <Text style={[text.body, { color: theme.text, flex: 1 }]}>
                {t('entry.capitalised')}
              </Text>
              <Switch
                accessibilityLabel={t('entry.capitalised')}
                value={capitalised}
                onValueChange={setCapitalised}
                trackColor={{ true: theme.primary, false: theme.border }}
              />
            </View>
          ) : null}
        </>
      ) : null}

      {type === 'expense' ? (
        <>
          <Text style={[text.label, { color: theme.textSecondary }]}>{t('entry.necessity')}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {NECESSITY.map((n) => (
              <Chip
                key={n}
                label={t(`necessity.${n}`)}
                selected={necessity === n}
                onPress={() => setNecessity(n)}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={[text.label, { color: theme.textSecondary }]}>{t('entry.date')}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {dateChoices.map((d, i) => (
          <Chip
            key={d}
            label={i === 0 ? t('entry.today') : t('entry.yesterday')}
            selected={occurredOn === d}
            onPress={() => setOccurredOn(d)}
          />
        ))}
        {!dateChoices.includes(occurredOn) ? (
          <Chip label={occurredOn} selected onPress={() => undefined} />
        ) : null}
      </View>

      <Text style={[text.label, { color: theme.textSecondary }]}>{t('entry.note')}</Text>
      <TextInput
        accessibilityLabel={t('entry.note')}
        value={note}
        onChangeText={setNote}
        placeholder={t('entry.notePlaceholder')}
        placeholderTextColor={theme.muted}
        maxLength={200}
        style={[text.body, styles.note]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.border,
    borderRadius: radius.md,
    padding: space.xs,
  },
  segmentItem: {
    flex: 1,
    minHeight: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentActive: { backgroundColor: theme.surface },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: size.touch },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amountInput: { flex: 1, color: theme.text, minHeight: size.input },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: size.touch,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  note: {
    minHeight: size.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: space.md,
    color: theme.text,
  },
});
