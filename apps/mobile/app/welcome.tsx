import { Feather } from '@expo/vector-icons';
import { LOCALES, type Locale } from '@invest/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button, OptionCard, Screen } from '../src/components/ui';
import { useSession } from '../src/state/session';
import { radius, space, text, theme } from '../src/theme/tokens';

const NATIVE_NAMES: Record<Locale, string> = { uz: 'Oʻzbekcha', ru: 'Русский', en: 'English' };
const APP_NAME = '[APP_NAME]'; // docs/OPEN_QUESTIONS.md

export default function Welcome() {
  const { t } = useTranslation();
  const { locale, setLocale, goToLogin } = useSession();

  return (
    <Screen
      footer={
        <>
          <Button
            label={t('common.continue')}
            onPress={async () => {
              await setLocale(locale);
              goToLogin();
            }}
          />
          <Text style={[text.small, styles.center, { color: theme.muted }]}>
            {t('welcome.privacyPrefix')}{' '}
            <Text style={{ color: theme.primary, textDecorationLine: 'underline' }}>
              {t('welcome.privacyLink')}
            </Text>
          </Text>
        </>
      }
    >
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Feather name="mic" size={26} color={theme.onPrimary} />
        </View>
        <Text style={[text.title, { color: theme.text }]}>{APP_NAME}</Text>
      </View>

      <Text style={[text.display, { color: theme.text }]} accessibilityRole="header">
        {t('welcome.title')}
      </Text>
      <Text style={[text.subtitle, { color: theme.textSecondary }]}>{t('welcome.subtitle')}</Text>

      <View
        style={styles.example}
        accessible
        accessibilityLabel={`${t('welcome.example')} → ${t('welcome.exampleNote')}, −40 000`}
      >
        <View style={styles.bubble}>
          <Text style={[text.body, { color: theme.primaryDark }]}>{t('welcome.example')}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.exampleRow}>
          <View style={styles.chip}>
            <Text style={[text.label, { color: theme.warningText }]}>
              {t('welcome.exampleCategory')}
            </Text>
          </View>
          <Text style={[text.body, { color: theme.textSecondary, flex: 1 }]}>
            {t('welcome.exampleNote')}
          </Text>
          <Text style={[text.label, { color: theme.text, fontSize: 18 }]}>
            −40 000 {t('common.sum')}
          </Text>
        </View>
      </View>

      <Text style={[text.label, { color: theme.textSecondary }]}>
        {t('welcome.chooseLanguage')}
      </Text>
      <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
        {LOCALES.map((code) => (
          <OptionCard
            key={code}
            label={NATIVE_NAMES[code]}
            selected={locale === code}
            onPress={() => void setLocale(code)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  example: {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: space.md,
    gap: space.md,
  },
  bubble: {
    alignSelf: 'flex-end',
    backgroundColor: theme.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  divider: { height: 1, backgroundColor: theme.border },
  exampleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chip: {
    backgroundColor: theme.warningBg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  center: { textAlign: 'center' },
});
