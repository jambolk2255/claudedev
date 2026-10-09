/**
 * Background work (inbox polling, outbox delivery, overdue events, auto backup).
 * `defineTask` must run at module load, so this file is imported from the root layout.
 */
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { openDb } from "@/db";
import { syncAll } from "@/integrations";

export const SYNC_TASK = "agentx-sync";

if (Platform.OS !== "web") {
  TaskManager.defineTask(SYNC_TASK, async () => {
    try {
      await openDb();
      await syncAll();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundSync(): Promise<void> {
  if (Platform.OS === "web") return;
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(SYNC_TASK)) return;
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 15 });
}
