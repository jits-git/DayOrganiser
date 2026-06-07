import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingModal } from "@/components/OnboardingModal";
import { GoogleAuthProvider } from "@/context/GoogleAuthContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { TaskProvider } from "@/context/TaskContext";
import { registerBackgroundSync } from "@/hooks/useBackgroundSync";
import { useVoiceAnnouncement } from "@/hooks/useVoiceAnnouncement";
import {
  requestNotificationPermissions,
  scheduleDailyReminders,
} from "@/hooks/useNotifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

async function setupNotifications() {
  const granted = await requestNotificationPermissions();
  if (granted) {
    await scheduleDailyReminders();
  }
}

setupNotifications();
registerBackgroundSync().catch(() => {});

function AppShell() {
  const { settings, isSettingsLoaded } = useSettings();
  useVoiceAnnouncement();
  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
      </Stack>
      <OnboardingModal visible={isSettingsLoaded && !settings.onboardingComplete} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <SettingsProvider>
                <GoogleAuthProvider>
                  <TaskProvider>
                    <AppShell />
                  </TaskProvider>
                </GoogleAuthProvider>
              </SettingsProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
