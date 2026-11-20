import { PIN_LENGTH } from '@invest/shared';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { api, refreshSession } from '../src/api';
import { PinPad } from '../src/components/PinPad';
import { ErrorText, Screen, Title } from '../src/components/ui';
import { LOCAL_MODE } from '../src/config';
import { getStore } from '../src/records';
import { checkPin, lockoutRemaining, startLockout } from '../src/state/pin';
import { secure } from '../src/state/secure';
import { useSession } from '../src/state/session';
import { space } from '../src/theme/tokens';

export default function Lock() {
  const { t } = useTranslation();
  const { unlocked, onboarded, signOut } = useSession();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometric, setBiometric] = useState(false);

  const finish = useCallback(async () => {
    if (LOCAL_MODE) {
      const done = await (await getStore()).getMeta('onboarded');
      if (done) onboarded();
      else useSession.setState({ stage: 'onboarding' });
      return;
    }
    // Fresh access token for this session; offline keeps working on cached data later.
    await refreshSession();
    const { data } = await api.GET('/v1/me').catch(() => ({ data: undefined }));
    if (data && !(data as { onboarded: boolean }).onboarded) {
      useSession.setState({ stage: 'onboarding' });
      return;
    }
    if (data) onboarded();
    else unlocked();
  }, [onboarded, unlocked]);

  const tryBiometric = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('pin.biometricPrompt'),
      disableDeviceFallback: true,
    });
    if (result.success) await finish();
  }, [finish, t]);

  useEffect(() => {
    void secure.get('biometric').then((flag) => {
      if (flag === '1') {
        setBiometric(true);
        void tryBiometric();
      }
    });
  }, [tryBiometric]);

  useEffect(() => {
    if (value.length !== PIN_LENGTH) return;
    void (async () => {
      const wait = await lockoutRemaining();
      if (wait > 0) {
        setValue('');
        setError(t('pin.lockedFor', { minutes: Math.ceil(wait / 60000) }));
        return;
      }
      const result = await checkPin(value);
      setValue('');
      if (result.ok) return finish();
      if (result.attemptsLeft === 0) {
        if (LOCAL_MODE) {
          await startLockout();
          setError(t('pin.lockedFor', { minutes: 5 }));
          return;
        }
        setError(t('pin.locked'));
        await signOut();
        return;
      }
      setError(t('pin.wrong', { count: result.attemptsLeft }));
    })();
  }, [value, finish, signOut, t]);

  return (
    <Screen>
      <View style={{ gap: space.sm, marginBottom: space.xl }}>
        <Title>{t('pin.enterTitle')}</Title>
        <ErrorText>{error}</ErrorText>
      </View>
      <PinPad
        value={value}
        onChange={(next) => {
          setError(null);
          setValue(next);
        }}
        onBiometric={biometric ? () => void tryBiometric() : undefined}
      />
    </Screen>
  );
}
