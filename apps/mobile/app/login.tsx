import { normaliseUzPhone, OTP_LENGTH, type TokenPair } from '@invest/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, asProblem } from '../src/api';
import { OtpInput } from '../src/components/OtpInput';
import { Button, ErrorText, Notice, Screen, Subtitle, Title } from '../src/components/ui';
import { useSession } from '../src/state/session';
import { radius, size, space, text, theme } from '../src/theme/tokens';

function formatNational(digits: string): string {
  // 90 123 45 67
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ');
}

export default function Login() {
  const { t } = useTranslation();
  const { locale, signedIn } = useSession();
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phone = normaliseUzPhone(digits);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  function showError(problemCode?: string) {
    const key = `login.errors.${problemCode}`;
    setError(t(key, { defaultValue: t('common.error') }));
  }

  async function requestCode() {
    if (!phone) return showError('invalid_phone');
    setBusy(true);
    setError(null);
    try {
      const {
        data,
        error: err,
        response,
      } = await api.POST('/v1/auth/otp/request', {
        body: { phone, locale },
      });
      if (data) {
        setCodeSent(true);
        setResendIn((data as { resendIn: number }).resendIn);
      } else {
        const problem = asProblem(err, response.status);
        if (problem.retryAfter) setResendIn(problem.retryAfter);
        if (problem.code === 'otp_cooldown') setCodeSent(true);
        showError(problem.code);
      }
    } catch {
      setError(t('common.offline'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!phone || code.length !== OTP_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const {
        data,
        error: err,
        response,
      } = await api.POST('/v1/auth/otp/verify', {
        body: {
          phone,
          code,
          locale,
          device: { platform: Platform.OS === 'ios' ? 'ios' : 'android' },
        },
      });
      if (data) {
        const result = data as TokenPair & { isNewUser: boolean };
        await signedIn(result, result.isNewUser);
      } else {
        showError(asProblem(err, response.status).code);
        setCode('');
      }
    } catch {
      setError(t('common.offline'));
    } finally {
      setBusy(false);
    }
  }

  const mm = Math.floor(resendIn / 60);
  const ss = String(resendIn % 60).padStart(2, '0');

  return (
    <Screen footer={<Notice icon="lock">{t('login.pinHint')}</Notice>}>
      <Title>{t('login.title')}</Title>
      <Subtitle>{t('login.subtitle')}</Subtitle>

      <Text style={[text.label, { color: theme.textSecondary }]}>{t('login.phone')}</Text>
      <View style={[styles.phone, phone && styles.phoneValid]}>
        <Text style={[text.body, styles.prefix]}>+998</Text>
        <View style={styles.sep} />
        <TextInput
          testID="phone-input"
          accessibilityLabel={t('login.phone')}
          value={formatNational(digits)}
          onChangeText={(v) => setDigits(v.replace(/\D/g, '').slice(0, 9))}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="90 123 45 67"
          placeholderTextColor={theme.muted}
          style={[text.body, styles.phoneInput]}
          editable={!busy}
        />
      </View>

      {codeSent ? (
        <>
          <View style={styles.codeHeader}>
            <Text style={[text.label, { color: theme.textSecondary }]}>{t('login.code')}</Text>
            {resendIn > 0 ? (
              <Text style={[text.small, { color: theme.muted }]}>
                {t('login.resendIn', { time: `${mm}:${ss}` })}
              </Text>
            ) : (
              <Text
                accessibilityRole="button"
                onPress={requestCode}
                style={[
                  text.label,
                  { color: theme.primary, minHeight: size.touch, textAlignVertical: 'center' },
                ]}
              >
                {t('login.resend')}
              </Text>
            )}
          </View>
          <OtpInput value={code} onChange={setCode} label={t('login.code')} />
        </>
      ) : null}

      <ErrorText>{error}</ErrorText>

      {codeSent ? (
        <Button
          label={t('common.confirm')}
          onPress={verify}
          loading={busy}
          disabled={code.length !== OTP_LENGTH}
        />
      ) : (
        <Button label={t('login.getCode')} onPress={requestCode} loading={busy} disabled={!phone} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  phone: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: space.md,
  },
  phoneValid: { borderColor: theme.primary, borderWidth: 2 },
  prefix: { color: theme.text, fontFamily: 'Inter_600SemiBold' },
  sep: { width: 1, height: 28, backgroundColor: theme.border, marginHorizontal: space.md },
  phoneInput: { flex: 1, color: theme.text, fontSize: 20, minHeight: size.input },
  codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
