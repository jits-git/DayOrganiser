import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { Platform } from "react-native";

import { DEFAULT_SETTINGS } from "@/types/settings";
import { Task } from "@/types/task";
import {
  DAILY_EVENING_ID,
  DAILY_MIDDAY_ID,
  DAILY_MORNING_ID,
} from "./useNotifications";
import { AnnouncementPeriod, buildAnnouncement } from "@/utils/buildAnnouncement";

const TASKS_KEY = "@dayorganizer/tasks";
const SETTINGS_KEY = "@dayorganizer/settings";

/**
 * Reads settings + tasks from AsyncStorage, builds the announcement for the
 * given period, and speaks it. Does NOT check voiceAnnouncementsEnabled, so
 * it works for debug triggers regardless of the toggle state.
 */
export async function triggerAnnouncement(period: AnnouncementPeriod): Promise<void> {
  if (Platform.OS === "web") return;

  let Speech: { speak: (text: string, opts?: object) => void } | null = null;
  try {
    Speech = require("expo-speech");
  } catch {
    return;
  }

  try {
    const [settingsRaw, tasksRaw] = await Promise.all([
      AsyncStorage.getItem(SETTINGS_KEY),
      AsyncStorage.getItem(TASKS_KEY),
    ]);

    const settings = settingsRaw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsRaw) }
      : DEFAULT_SETTINGS;

    const tasks: Task[] = tasksRaw ? JSON.parse(tasksRaw) : [];
    const text = buildAnnouncement(tasks, settings, period);

    Speech!.speak(text, { language: "en-US" });
  } catch {}
}

export function useVoiceAnnouncement(): void {
  useEffect(() => {
    if (Platform.OS === "web") return;

    let Notifications: {
      addNotificationResponseReceivedListener: (cb: (r: any) => void) => { remove: () => void };
    } | null = null;

    try {
      Notifications = require("expo-notifications");
    } catch {
      return;
    }

    if (!Notifications) return;

    const sub = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const notifId: string =
          response?.notification?.request?.identifier ?? "";

        const period: AnnouncementPeriod | null =
          notifId === DAILY_MORNING_ID
            ? "morning"
            : notifId === DAILY_MIDDAY_ID
            ? "afternoon"
            : notifId === DAILY_EVENING_ID
            ? "evening"
            : null;

        if (!period) return;

        try {
          const settingsRaw = await AsyncStorage.getItem(SETTINGS_KEY);
          const settings = settingsRaw
            ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsRaw) }
            : DEFAULT_SETTINGS;

          if (!settings.voiceAnnouncementsEnabled) return;

          // Brief delay lets the UI settle before speaking
          setTimeout(() => triggerAnnouncement(period), 700);
        } catch {}
      }
    );

    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, []);
}
