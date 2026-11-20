import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { groupDigits } from '../records/format';
import { radius, size, space, text, theme } from '../theme/tokens';

export function Chip({
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

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {children}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={[text.label, { color: theme.textSecondary }]}>{children}</Text>;
}

export function SumInput({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
}) {
  return (
    <View style={styles.input}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(v) => onChange(groupDigits(v))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={theme.muted}
        style={[text.title, { flex: 1, color: theme.text }]}
      />
      <Text style={[text.body, { color: theme.textSecondary }]}>{unit}</Text>
    </View>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      maxLength={60}
      style={[text.body, styles.input, { color: theme.text }]}
    />
  );
}

export function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={[text.body, { color: theme.text, flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.primary, false: theme.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: size.touch },
});
