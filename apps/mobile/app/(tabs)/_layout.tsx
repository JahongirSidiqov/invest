import { Feather } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { type ColorValue, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '../../src/theme/tokens';

function icon(name: keyof typeof Feather.glyphMap) {
  return function TabBarIcon({ color }: { color: ColorValue }) {
    return <Feather name={name} size={24} color={color as string} />;
  };
}

/** Bottom navigation from the mockups: Home, Budget, central microphone, Learn, Invest. */
export default function TabsLayout() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, height: 72 },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 12 },
        tabBarItemStyle: { paddingTop: 8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen
        name="budget"
        options={{ title: t('tabs.budget'), tabBarIcon: icon('pie-chart') }}
      />
      <Tabs.Screen
        name="mic"
        options={{
          title: '',
          tabBarAccessibilityLabel: t('tabs.voice'),
          tabBarButton: () => (
            <View style={styles.micSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('tabs.voice')}
                onPress={() => router.push('/voice')}
                style={styles.mic}
              >
                <Feather name="mic" size={30} color={theme.onPrimary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{ title: t('tabs.learn'), tabBarIcon: icon('book-open') }}
      />
      <Tabs.Screen
        name="invest"
        options={{ title: t('tabs.invest'), tabBarIcon: icon('trending-up') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  micSlot: { flex: 1, alignItems: 'center' },
  mic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginTop: -28,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primaryDark,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
