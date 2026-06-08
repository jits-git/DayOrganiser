import Constants from "expo-constants";
import { Platform } from "react-native";

import { Task } from "@/types/task";

/**
 * expo-notifications push notification support was removed from Expo Go in SDK 53.
 * We skip the entire module when running inside Expo Go to avoid the console error.
 * In a development build or standalone app, full notification support is available.
 */
const isExpoGo =
  Platform.OS !== "web" && Constants.appOwnership === "expo";

type NotificationsModule = typeof import("expo-notifications");
let N: NotificationsModule | null = null;

if (!isExpoGo && Platform.OS !== "web") {
  try {
    N = require("expo-notifications") as NotificationsModule;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {}
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!N) return false;
  try {
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await N.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export const DAILY_MORNING_ID = "daily-morning";
export const DAILY_MIDDAY_ID = "daily-midday";
export const DAILY_EVENING_ID = "daily-evening";

interface DailyTimes {
  morning?: { hour: number; minute: number };
  afternoon?: { hour: number; minute: number };
  evening?: { hour: number; minute: number };
  morningEnabled?: boolean;
  afternoonEnabled?: boolean;
  eveningEnabled?: boolean;
}

export async function scheduleDailyReminders(
  times: DailyTimes = {}
): Promise<void> {
  if (!N) return;
  const morning = times.morning ?? { hour: 7, minute: 0 };
  const afternoon = times.afternoon ?? { hour: 13, minute: 0 };
  const evening = times.evening ?? { hour: 22, minute: 0 };
  const mEnabled = times.morningEnabled !== false;
  const aEnabled = times.afternoonEnabled !== false;
  const eEnabled = times.eveningEnabled !== false;

  try {
    await N.cancelScheduledNotificationAsync(DAILY_MORNING_ID).catch(() => {});
    await N.cancelScheduledNotificationAsync(DAILY_MIDDAY_ID).catch(() => {});
    await N.cancelScheduledNotificationAsync(DAILY_EVENING_ID).catch(() => {});

    if (mEnabled) {
      await N.scheduleNotificationAsync({
        identifier: DAILY_MORNING_ID,
        content: {
          title: "Good morning",
          body: "Check your tasks and deadlines for today.",
          sound: true,
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DAILY,
          hour: morning.hour,
          minute: morning.minute,
        },
      });
    }

    if (aEnabled) {
      await N.scheduleNotificationAsync({
        identifier: DAILY_MIDDAY_ID,
        content: {
          title: "Midday check-in",
          body: "How are your tasks going? Stay on track.",
          sound: true,
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DAILY,
          hour: afternoon.hour,
          minute: afternoon.minute,
        },
      });
    }

    if (eEnabled) {
      await N.scheduleNotificationAsync({
        identifier: DAILY_EVENING_ID,
        content: {
          title: "Evening wrap-up",
          body: "Review what you completed and what is left for today.",
          sound: true,
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DAILY,
          hour: evening.hour,
          minute: evening.minute,
        },
      });
    }
  } catch {}
}

export async function scheduleTaskNotification(
  task: Task
): Promise<string | null> {
  if (!N || task.isCompleted) return null;

  const targetTime = new Date(task.targetDate).getTime();
  const oneHourBefore = new Date(targetTime - 60 * 60 * 1000);
  if (oneHourBefore <= new Date()) return null;

  try {
    const id = await N.scheduleNotificationAsync({
      content: {
        title: "Task due in 1 hour",
        body: task.description,
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: oneHourBefore,
      },
    });
    return id;
  } catch {
    return null;
  }
}

export async function scheduleDeadlineNotification(
  task: Task
): Promise<string | null> {
  if (!N || task.isCompleted || !task.isImportant) return null;

  const deadlineTime = new Date(task.hardDeadline).getTime();
  const oneHourBefore = new Date(deadlineTime - 60 * 60 * 1000);
  if (oneHourBefore <= new Date()) return null;

  try {
    const id = await N.scheduleNotificationAsync({
      content: {
        title: "⭐ Important deadline in 1 hour",
        body: task.description,
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: oneHourBefore,
      },
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelTaskNotification(
  notificationId: string
): Promise<void> {
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(notificationId);
  } catch {}
}
