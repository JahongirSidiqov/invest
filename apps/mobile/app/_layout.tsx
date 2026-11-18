import '../src/i18n';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAutoSync, useRecordsInvalidation } from '../src/records/hooks';
import { useSession } from '../src/state/session';
import { theme } from '../src/theme/tokens';

void SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();

/** Keeps local queries fresh and syncs in the background once the user is in the app. */
function RecordsBridge({ enabled }: { enabled: boolean }) {
  useRecordsInvalidation();
  useAutoSync(enabled);
  return null;
}

export default function RootLayout() {
  const stage = useSession((s) => s.stage);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    void useSession.getState().hydrate();
    const sub = AppState.addEventListener('change', (state) => {
      const session = useSession.getState();
      if (state === 'background') session.onBackground();
      if (state === 'active') session.onForeground();
    });
    return () => sub.remove();
  }, []);

  const ready = fontsLoaded && stage !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Protected guard={stage === 'welcome'}>
            <Stack.Screen name="welcome" />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'login'}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'pin-setup'}>
            <Stack.Screen name="pin-setup" />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'onboarding'}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'locked'}>
            <Stack.Screen name="lock" />
          </Stack.Protected>
          <Stack.Protected guard={stage === 'ready'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="voice" options={{ presentation: 'modal' }} />
            <Stack.Screen name="entry" options={{ presentation: 'modal' }} />
            <Stack.Screen name="history" />
            <Stack.Screen name="settings" />
          </Stack.Protected>
        </Stack>
        <RecordsBridge enabled={stage === 'ready'} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
