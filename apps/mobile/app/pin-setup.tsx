import { PIN_LENGTH } from '@invest/shared';
import * as LocalAuthentication from 'expo-local-authentication';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PinPad } from '../src/components/PinPad';
import { Button, ErrorText, Screen, Subtitle, Title } from '../src/components/ui';
import { savePin } from '../src/state/pin';
import { secure } from '../src/state/secure';
import { useSession } from '../src/state/session';
import { space } from '../src/theme/tokens';

type Step = 'create' | 'repeat' | 'biometric';

export default function PinSetup() {
  const { t } = useTranslation();
  const pinCreated = useSession((s) => s.pinCreated);
  const [step, setStep] = useState<Step>('create');
  const [first, setFirst] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    setError(null);
    if (next.length < PIN_LENGTH) return setValue(next);
    setValue('');
    if (step === 'create') {
      setFirst(next);
      setStep('repeat');
      return;
    }
    if (next !== first) {
      setError(t('pin.mismatch'));
      setFirst('');
      setStep('create');
      return;
    }
    await savePin(next);
    const canUseBiometrics =
      (await LocalAuthentication.hasHardwareAsync()) &&
      (await LocalAuthentication.isEnrolledAsync());
    if (canUseBiometrics) setStep('biometric');
    else pinCreated();
  }

  if (step === 'biometric') {
    return (
      <Screen
        footer={
          <>
            <Button
              label={t('pin.biometricEnable')}
              onPress={async () => {
                const result = await LocalAuthentication.authenticateAsync({
                  promptMessage: t('pin.biometricPrompt'),
                });
                if (result.success) await secure.set('biometric', '1');
                pinCreated();
              }}
            />
            <Button label={t('pin.biometricLater')} variant="secondary" onPress={pinCreated} />
          </>
        }
      >
        <Title>{t('pin.biometricTitle')}</Title>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: space.sm, marginBottom: space.xl }}>
        <Title>{step === 'create' ? t('pin.createTitle') : t('pin.repeatTitle')}</Title>
        <Subtitle>{t('pin.createSubtitle')}</Subtitle>
        <ErrorText>{error}</ErrorText>
      </View>
      <PinPad value={value} onChange={(next) => void handleChange(next)} />
    </Screen>
  );
}
