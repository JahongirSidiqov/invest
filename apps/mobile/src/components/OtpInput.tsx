import { OTP_LENGTH } from '@invest/shared';
import { type ComponentRef, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius, space, text, theme } from '../theme/tokens';

/** Six boxes backed by one hidden input, so paste and SMS autofill work. */
export function OtpInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel={label}>
      <View style={styles.row}>
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const active = i === Math.min(value.length, OTP_LENGTH - 1);
          return (
            <View key={i} style={[styles.box, active && styles.boxActive]}>
              <Text style={[text.title, { color: theme.text }]}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        testID="otp-input"
        value={value}
        onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        style={styles.hidden}
        accessibilityLabel={label}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  box: {
    flex: 1,
    aspectRatio: 0.9,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: theme.primary, borderWidth: 2 },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
