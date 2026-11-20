import { GOALS, HALAL_PREFS, INCOME_RANGES } from '@invest/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../src/api';
import { LOCAL_MODE } from '../src/config';
import { Label, SumInput } from '../src/components/form';
import { getStore } from '../src/records';
import { parseSumInput } from '../src/records/format';
import {
  Button,
  ErrorText,
  IconButton,
  OptionCard,
  Screen,
  Subtitle,
  Title,
} from '../src/components/ui';
import { useSession } from '../src/state/session';
import { radius, space, text, theme } from '../src/theme/tokens';

const QUESTIONS = [
  { key: 'income', field: 'incomeRange', options: INCOME_RANGES },
  { key: 'goal', field: 'goal', options: GOALS },
  { key: 'halal', field: 'halalPref', options: HALAL_PREFS },
] as const;

type Answers = { incomeRange: string | null; goal: string | null; halalPref: string | null };

export default function Onboarding() {
  const { t } = useTranslation();
  const onboarded = useSession((s) => s.onboarded);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    incomeRange: null,
    goal: null,
    halalPref: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savings, setSavings] = useState('');
  const [spending, setSpending] = useState('');
  const steps = QUESTIONS.length + 1; // the last step asks about money for the provisional stage
  const question = QUESTIONS[index];
  const selected = question ? answers[question.field] : null;

  async function next() {
    if (index < steps - 1) return setIndex(index + 1);
    setBusy(true);
    setError(null);
    try {
      // Answers are kept on the phone too, so the provisional stage works offline.
      const store = await getStore();
      await store.setMeta(
        'onboarding',
        JSON.stringify({
          ...answers,
          savingsMinor: savings ? parseSumInput(savings) : null,
          spendingMinor: spending ? parseSumInput(spending) : null,
        }),
      );
      if (!LOCAL_MODE) {
        const { data } = await api.PUT('/v1/me/onboarding', { body: answers as never });
        if (!data) return setError(t('common.error'));
      }
      await store.setMeta('onboarded', '1');
      onboarded();
    } catch {
      setError(t('common.offline'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Text style={[text.small, styles.center, { color: theme.muted }]}>
            {t('onboarding.footer')}
          </Text>
          <ErrorText>{error}</ErrorText>
          <Button label={t('common.next')} onPress={next} loading={busy} />
        </>
      }
    >
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label={t('common.back')}
          onPress={() => setIndex(Math.max(index - 1, 0))}
          style={{ opacity: index === 0 ? 0 : 1 }}
        />
        <Text style={[text.label, { color: theme.textSecondary }]}>
          {t('onboarding.progress', { current: index + 1, total: steps })}
        </Text>
        <Text accessibilityRole="button" onPress={next} style={[text.label, styles.skip]}>
          {t('common.skip')}
        </Text>
      </View>

      <View style={styles.progress}>
        {Array.from({ length: steps }, (_, i) => (
          <View key={i} style={[styles.bar, i <= index && styles.barActive]} />
        ))}
      </View>

      {question ? (
        <>
          <Title>{t(`onboarding.${question.key}.title`)}</Title>
          <Subtitle>{t(`onboarding.${question.key}.subtitle`)}</Subtitle>

          <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
            {question.options.map((option) => (
              <OptionCard
                key={option}
                label={t(`onboarding.${question.key}.${option}`)}
                selected={selected === option}
                onPress={() => setAnswers({ ...answers, [question.field]: option })}
              />
            ))}
          </View>
        </>
      ) : (
        <>
          <Title>{t('onboardingMoney.title')}</Title>
          <Subtitle>{t('onboardingMoney.subtitle')}</Subtitle>
          <Label>{t('onboardingMoney.savings')}</Label>
          <SumInput
            label={t('onboardingMoney.savings')}
            value={savings}
            onChange={setSavings}
            unit={t('common.sum')}
          />
          <Label>{t('onboardingMoney.spending')}</Label>
          <SumInput
            label={t('onboardingMoney.spending')}
            value={spending}
            onChange={setSpending}
            unit={t('common.sum')}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skip: {
    color: theme.primary,
    minWidth: 44,
    minHeight: 44,
    textAlignVertical: 'center',
    textAlign: 'right',
  },
  progress: { flexDirection: 'row', gap: space.sm },
  bar: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: theme.border },
  barActive: { backgroundColor: theme.primary },
  center: { textAlign: 'center' },
});
