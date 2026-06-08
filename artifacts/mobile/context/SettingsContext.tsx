import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";
import { scheduleDailyReminders } from "@/hooks/useNotifications";

const STORAGE_KEY = "@dayorganizer/settings";
const INTRO_SEEN_KEY = "@dayorganizer/introductionSeen";

interface SettingsContextType {
  settings: AppSettings;
  isSettingsLoaded: boolean;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  introVisible: boolean;
  openIntroduction: () => void;
  closeIntroduction: () => void;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [introVisible, setIntroVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migration: existing users who already have stored settings skip onboarding
        setSettings({ ...DEFAULT_SETTINGS, onboardingComplete: true, ...parsed });
      }
      setIsSettingsLoaded(true);
    });
  }, []);

  // Auto-show introduction once after onboarding is complete
  useEffect(() => {
    if (!isSettingsLoaded || !settings.onboardingComplete) return;
    AsyncStorage.getItem(INTRO_SEEN_KEY).then((seen) => {
      if (!seen) setIntroVisible(true);
    });
  }, [isSettingsLoaded, settings.onboardingComplete]);

  const updateSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      const next = { ...settings, ...updates };
      setSettings(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      await scheduleDailyReminders({
        morning: next.morningNotification,
        afternoon: next.afternoonNotification,
        evening: next.eveningNotification,
        morningEnabled: next.morningEnabled !== false,
        afternoonEnabled: next.afternoonEnabled !== false,
        eveningEnabled: next.eveningEnabled !== false,
      });
    },
    [settings]
  );

  const openIntroduction = useCallback(() => setIntroVisible(true), []);

  const closeIntroduction = useCallback(async () => {
    setIntroVisible(false);
    await AsyncStorage.setItem(INTRO_SEEN_KEY, "true");
  }, []);

  return (
    <SettingsContext.Provider
      value={{ settings, isSettingsLoaded, updateSettings, introVisible, openIntroduction, closeIntroduction }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
