import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { backupToDrive, isWithinSyncWindow } from "@/utils/googleDrive";

export const BACKGROUND_SYNC_TASK = "DRIVE_BACKGROUND_SYNC";

// Register task handler at module level (must be outside components)
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    if (!isWithinSyncWindow()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    await backupToDrive();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 4 * 60 * 60, // 4 hours in seconds
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  }
}
