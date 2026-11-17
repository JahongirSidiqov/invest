import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, size, space, text, theme } from '../theme/tokens';

export function Screen({
  children,
  footer,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const body = <View style={styles.body}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={[text.title, { color: theme.text }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={[text.subtitle, { color: theme.textSecondary }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? theme.onPrimary : theme.primary} />
      ) : (
        <Text style={[text.button, { color: primary ? theme.onPrimary : theme.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Selectable row used for language choice and onboarding answers. */
export function OptionCard({
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
      style={[styles.option, selected && styles.optionSelected]}
    >
      <Text style={[text.body, { color: theme.text, flex: 1 }]}>{label}</Text>
      {selected ? <Feather name="check-circle" size={24} color={theme.primary} /> : null}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  style,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={[styles.iconButton, style]}
    >
      <Feather name={icon} size={22} color={theme.text} />
    </Pressable>
  );
}

export function Notice({
  icon,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  children: ReactNode;
}) {
  return (
    <View style={styles.notice}>
      <Feather name={icon} size={20} color={theme.primary} style={{ marginTop: 2 }} />
      <Text style={[text.body, { color: theme.primaryDark, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={[text.small, { color: theme.dangerText }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  scroll: { flexGrow: 1 },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  button: {
    minHeight: size.button,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonPrimary: { backgroundColor: theme.primary },
  buttonSecondary: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  buttonDisabled: { opacity: 0.5 },
  option: {
    minHeight: size.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionSelected: { borderColor: theme.primary, borderWidth: 2 },
  iconButton: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.sm,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.primarySoft,
  },
});
