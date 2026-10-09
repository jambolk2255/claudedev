import { addDays, dayKey, startOfDay } from "./time";
import type { Task } from "./types";

const due = (t: Task) => (t.dueAt ? new Date(t.dueAt) : null);
const byDue = (a: Task, b: Task) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || a.createdAt.localeCompare(b.createdAt);

/** Open task whose time has passed (all-day tasks become overdue the next day). */
export function isOverdue(t: Task, now: Date): boolean {
  const d = due(t);
  if (t.status !== "open" || !d || t.deletedAt) return false;
  return t.allDay ? d < startOfDay(now) : d < now;
}

export function overdue(tasks: Task[], now: Date): Task[] {
  return tasks.filter((t) => isOverdue(t, now)).sort(byDue);
}

/** Today's tasks (open and done today), excluding overdue ones. */
export function today(tasks: Task[], now: Date): Task[] {
  const key = dayKey(now);
  return tasks
    .filter((t) => {
      if (t.deletedAt || isOverdue(t, now)) return false;
      if (t.status === "done") return !!t.completedAt && dayKey(new Date(t.completedAt)) === key && (!t.dueAt || dayKey(new Date(t.dueAt)) <= key);
      const d = due(t);
      return !!d && dayKey(d) === key;
    })
    .sort((a, b) => (a.status === b.status ? byDue(a, b) : a.status === "open" ? -1 : 1));
}

/** Open tasks due after today within `days`, grouped by local day. */
export function upcoming(tasks: Task[], now: Date, days = 7): { day: string; date: Date; tasks: Task[] }[] {
  const from = addDays(startOfDay(now), 1);
  const to = addDays(from, days);
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const d = due(t);
    if (t.status !== "open" || t.deletedAt || !d || d < from || d >= to) continue;
    const k = dayKey(d);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const [y, m, dd] = day.split("-").map(Number);
      return { day, date: new Date(y!, m! - 1, dd!), tasks: list.sort(byDue) };
    });
}

export function someday(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === "open" && !t.deletedAt && !t.dueAt).sort(byDue);
}

export function countsByArea(tasks: Task[], now: Date): Map<string | null, { open: number; overdue: number }> {
  const m = new Map<string | null, { open: number; overdue: number }>();
  for (const t of tasks) {
    if (t.status !== "open" || t.deletedAt) continue;
    const c = m.get(t.areaId) ?? { open: 0, overdue: 0 };
    c.open++;
    if (isOverdue(t, now)) c.overdue++;
    m.set(t.areaId, c);
  }
  return m;
}

/** Share of today's tasks already done (0..1). */
export function progress(tasks: Task[], now: Date): number {
  const list = today(tasks, now);
  const total = list.length + overdue(tasks, now).length;
  if (!total) return 0;
  return list.filter((t) => t.status === "done").length / total;
}
