/** Glue used by screens, the voice agent and notification buttons: every task change goes through here. */
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { completeTask, snoozeTask } from "@/core/ops";
import type { Task } from "@/core/types";
import { loadSettings, repo } from "@/db";
import { emitEvent } from "@/integrations";
import { scheduleTask } from "@/notifications";

export async function onTaskChange(task: Task, kind: "created" | "updated" | "completed" | "deleted"): Promise<void> {
  const settings = await loadSettings();
  const fresh = kind === "deleted" ? { ...task, deletedAt: task.deletedAt ?? new Date().toISOString() } : ((await repo.getTask(task.id)) ?? task);
  await scheduleTask(fresh, settings).catch(() => {});
  if (kind === "created") await emitEvent("task.created", fresh).catch(() => {});
  if (kind === "completed") await emitEvent("task.completed", fresh).catch(() => {});
}

export async function complete(id: string): Promise<void> {
  // A notification button can be delivered twice on cold start; never complete (and repeat) twice.
  if ((await repo.getTask(id))?.status !== "open") return;
  const { done, next } = await completeTask(repo, id, new Date());
  await onTaskChange(done, "completed");
  if (next) await onTaskChange(next, "created");
}

export async function snooze(id: string, minutes = 60): Promise<void> {
  const t = await snoozeTask(repo, id, minutes, new Date());
  await onTaskChange(t, "updated");
}

/** Handles taps and the Done / Snooze buttons on reminders. */
export async function handleNotificationResponse(r: Notifications.NotificationResponse): Promise<void> {
  const data = (r.notification.request.content.data ?? {}) as { taskId?: string; kind?: string };
  if (data.taskId && r.actionIdentifier === "done") {
    await complete(data.taskId);
    await Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
    return;
  }
  if (data.taskId && r.actionIdentifier === "snooze") {
    await snooze(data.taskId, 60);
    await Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
    return;
  }
  if (data.kind === "briefing" || data.kind === "review") {
    router.push({ pathname: "/voice", params: { mode: data.kind } });
    return;
  }
  if (data.taskId) router.push({ pathname: "/task/[id]", params: { id: data.taskId } });
}
