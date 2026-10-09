import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { addMinutes, afterQuietHours, hm, relativeLabel } from "@/core/time";
import type { Settings, Task } from "@/core/types";
import { clearAllNotifIds, notifIds, repo, setNotifIds } from "@/db";
import { translate } from "@/lib/i18n";

const CHANNEL = "reminders";
const CATEGORY = "task";
const MAX_NAGS = 3;
const HORIZON_DAYS = 45;
/** Local notifications are native-only; the web build is just a preview. */
const WEB = Platform.OS === "web";

export async function setupNotifications(lang: "si" | "en"): Promise<boolean> {
  if (WEB) return false;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: translate(lang, "notif.channel"),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#2D5BFF",
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: "done", buttonTitle: translate(lang, "notif.done"), options: { opensAppToForeground: true } },
    { identifier: "snooze", buttonTitle: translate(lang, "notif.snooze"), options: { opensAppToForeground: true } },
  ]);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

const at = (date: Date): Notifications.NotificationTriggerInput => ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL });

/** Times to nag about an overdue task: every `nagMinutes` after the due time, skipping quiet hours. */
export function nagTimes(due: Date, now: Date, s: Settings): Date[] {
  if (s.nagMinutes <= 0) return [];
  const step = s.nagMinutes;
  const passed = Math.max(0, Math.ceil((now.getTime() - due.getTime()) / (step * 60_000)));
  const out: Date[] = [];
  for (let k = Math.max(1, passed); out.length < MAX_NAGS && k < passed + 50; k++) {
    const t = afterQuietHours(addMinutes(due, step * k), s.quietStart, s.quietEnd);
    if (t > now && !out.some((o) => o.getTime() === t.getTime())) out.push(t);
  }
  return out;
}

/** Replaces the scheduled notifications for one task. */
export async function scheduleTask(task: Task, s: Settings): Promise<void> {
  if (WEB) return;
  for (const id of await notifIds(task.id)) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  if (task.status !== "open" || task.deletedAt || !task.dueAt) {
    await setNotifIds(task.id, []);
    return;
  }
  const now = new Date();
  const due = new Date(task.dueAt);
  if (due.getTime() - now.getTime() > HORIZON_DAYS * 86_400_000) {
    await setNotifIds(task.id, []);
    return;
  }
  const areas = await repo.listAreas();
  const area = areas.find((a) => a.id === task.areaId);
  const when = relativeLabel(task.dueAt, task.allDay, now, s.lang);
  const data = { taskId: task.id };
  const ids: string[] = [];

  // All-day tasks remind at the morning briefing time on the day.
  const base = task.allDay ? new Date(due.getFullYear(), due.getMonth(), due.getDate(), Math.floor(hm(s.briefingTime) / 60), hm(s.briefingTime) % 60) : due;
  const offsets = task.remind.length ? task.remind : [0];
  for (const off of [...new Set(offsets)]) {
    const fire = addMinutes(base, -off);
    if (fire <= now) continue;
    const prefix = off === 0 ? "⏰" : "🔔";
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${prefix} ${task.title}`,
          body: [when, area ? `${area.icon} ${area.name}` : "", task.amount ? `LKR ${task.amount.toLocaleString()}` : ""].filter(Boolean).join(" · "),
          data,
          categoryIdentifier: CATEGORY,
        },
        trigger: at(fire),
      }),
    );
  }
  for (const fire of nagTimes(base, now, s)) {
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: { title: `⚠ ${translate(s.lang, "notif.overdueTitle")}: ${task.title}`, body: when, data, categoryIdentifier: CATEGORY },
        trigger: at(fire),
      }),
    );
  }
  await setNotifIds(task.id, ids);
}

async function scheduleDaily(s: Settings) {
  for (const [identifier, time, title, body] of [
    ["agentx.briefing", s.briefingTime, "notif.briefingTitle", "notif.briefingBody"],
    ["agentx.review", s.reviewTime, "notif.reviewTitle", "notif.reviewBody"],
  ] as const) {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    if (!time) continue;
    const m = hm(time);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `☀ ${translate(s.lang, title)}`,
        body: translate(s.lang, body),
        data: { kind: identifier === "agentx.briefing" ? "briefing" : "review" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: Math.floor(m / 60), minute: m % 60, channelId: CHANNEL },
    });
  }
}

/** Rebuilds every scheduled notification (app start, settings change, restore). */
export async function rescheduleAll(s: Settings): Promise<void> {
  if (WEB) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await clearAllNotifIds();
  const tasks = (await repo.listTasks()).filter((t) => t.status === "open" && t.dueAt);
  // Android caps scheduled alarms (~500); keep the nearest tasks.
  tasks.sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  for (const t of tasks.slice(0, 120)) await scheduleTask(t, s);
  await scheduleDaily(s);
}

export async function showNow(title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  if (WEB) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
}
