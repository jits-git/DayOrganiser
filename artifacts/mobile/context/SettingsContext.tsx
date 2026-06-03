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

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) setSettings(JSON.parse(stored));
    });
  }, []);

  const updateSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      const next = { ...settings, ...updates };
      setSettings(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      await scheduleDailyReminders({
        morning: next.morningNotification,
        afternoon: next.afternoonNotification,
        evening: next.eveningNotification,
      });
    },
    [settings]
  );

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
