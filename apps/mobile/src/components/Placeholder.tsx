import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { theme, text } from '../theme/tokens';
import { Screen, Title } from './ui';

/** Tab content until its phase is built. */
export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <Title>{t(titleKey)}</Title>
      <Text style={[text.body, { color: theme.muted }]}>{t('placeholder.soon')}</Text>
    </Screen>
  );
}
