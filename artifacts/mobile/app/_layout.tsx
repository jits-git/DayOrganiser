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
import { IntroductionModal } from "@/components/IntroductionModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { GoogleAuthProvider } from "@/context/GoogleAuthContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { TaskProvider } from "@/context/TaskContext";
import { useVoiceAnnouncement } from "@/hooks/useVoiceAnnouncement";
import {
  requestNotificationPermissions,
  scheduleDailyReminders,
} from "@/hooks/useNotifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AppShell() {
  const { settings, isSettingsLoaded, introVisible, closeIntroduction } = useSettings();
  useVoiceAnnouncement();

  useEffect(() => {
    if (!isSettingsLoaded) return;
    requestNotificationPermissions().then((granted) => {
      if (!granted) return;
      scheduleDailyReminders({
        morning: settings.morningNotification,
        afternoon: settings.afternoonNotification,
        evening: settings.eveningNotification,
        morningEnabled: settings.morningEnabled !== false,
        afternoonEnabled: settings.afternoonEnabled !== false,
        eveningEnabled: settings.eveningEnabled !== false,
      });
    });
  }, [isSettingsLoaded]);

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
        <Stack.Screen
          name="popo"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
      </Stack>
      <OnboardingModal visible={isSettingsLoaded && !settings.onboardingComplete} />
      <IntroductionModal visible={introVisible} onClose={closeIntroduction} />
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
