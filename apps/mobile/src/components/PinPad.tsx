import { Feather } from '@expo/vector-icons';
import { PIN_LENGTH } from '@invest/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, size, space, text, theme } from '../theme/tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'] as const;

/** 4 dots + numeric keypad with 56 px keys. */
export function PinPad({
  value,
  onChange,
  onBiometric,
}: {
  value: string;
  onChange: (next: string) => void;
  onBiometric?: () => void;
}) {
  const { t } = useTranslation();

  function press(key: (typeof KEYS)[number]) {
    if (key === 'del') return onChange(value.slice(0, -1));
    if (key === 'bio') return onBiometric?.();
    if (value.length < PIN_LENGTH) onChange(value + key);
  }

  return (
    <View style={styles.wrap}>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`PIN ${value.length} / ${PIN_LENGTH}`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key) => {
          if (key === 'bio' && !onBiometric) return <View key={key} style={styles.key} />;
          const label =
            key === 'del' ? t('pin.delete') : key === 'bio' ? t('pin.useBiometric') : key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => press(key)}
              style={({ pressed }) => [
                styles.key,
                pressed && { backgroundColor: theme.primarySoft },
              ]}
            >
              {key === 'del' ? (
                <Feather name="delete" size={24} color={theme.text} />
              ) : key === 'bio' ? (
                <Feather name="smile" size={24} color={theme.primary} />
              ) : (
                <Text style={[text.title, { color: theme.text }]}>{key}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.xl },
  dots: { flexDirection: 'row', gap: space.md },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  dotFilled: { backgroundColor: theme.primary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 3 * 88,
    justifyContent: 'space-between',
    rowGap: space.md,
  },
  key: {
    width: 72,
    height: Math.max(size.button, 64),
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
