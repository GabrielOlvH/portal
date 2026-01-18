import { useEffect } from 'react';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { navTheme } from '@/lib/theme';
import { StoreProvider, useStore } from '@/lib/store';
import { registerNotificationsForHosts, unregisterNotificationsForHosts } from '@/lib/notifications';
import { ProjectsProvider } from '@/lib/projects-store';
import { QueryProvider } from '@/lib/query';
import { LaunchSheetProvider, useLaunchSheet } from '@/lib/launch-sheet';
import { LaunchSheet } from '@/components/LaunchSheet';
import { ThemeSettingProvider } from '@/lib/useTheme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryProvider>
          <StoreProvider>
            <RootBootstrap loaded={loaded} />
          </StoreProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootBootstrap({ loaded }: { loaded: boolean }) {
  const { ready } = useStore();

  useEffect(() => {
    if (loaded && ready) {
      SplashScreen.hideAsync();
    }
  }, [loaded, ready]);

  if (!loaded || !ready) {
    return null;
  }

  return <ThemedApp />;
}

function ThemedApp() {
  const { preferences, hosts } = useStore();

  useEffect(() => {
    if (preferences.notifications.pushEnabled) {
      void registerNotificationsForHosts(hosts);
    } else {
      void unregisterNotificationsForHosts(hosts);
    }
  }, [hosts, preferences.notifications.pushEnabled]);

  return (
    <ThemeSettingProvider value={preferences.theme}>
      <ProjectsProvider>
        <LaunchSheetProvider>
          <ThemeProvider value={navTheme}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="session/[hostId]/[name]/terminal" />
              <Stack.Screen name="hosts/[id]" />
              <Stack.Screen name="hosts/new" />
              <Stack.Screen name="hosts/[id]/edit" />
              <Stack.Screen name="hosts/[id]/docker/[containerId]" />
              <Stack.Screen name="projects" />
              <Stack.Screen name="projects/new" />
              <Stack.Screen name="projects/[id]/commands" />
              <Stack.Screen name="ports" />
              <Stack.Screen name="session/[hostId]/[name]" />
            </Stack>
            <GlobalLaunchSheet />
          </ThemeProvider>
        </LaunchSheetProvider>
      </ProjectsProvider>
    </ThemeSettingProvider>
  );
}

function GlobalLaunchSheet() {
  const { isOpen, close } = useLaunchSheet();
  return <LaunchSheet isOpen={isOpen} onClose={close} />;
}
