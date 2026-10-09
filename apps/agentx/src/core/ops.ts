import { nextOccurrence } from "./recurrence";
import { addMinutes, toLocalISO } from "./time";
import type { Repo, Task } from "./types";

/** Marks a task done; for a repeating task the next occurrence is created as a new open task. */
export async function completeTask(repo: Repo, id: string, now: Date): Promise<{ done: Task; next: Task | null }> {
  const task = await repo.getTask(id);
  if (!task) throw new Error(`Task ${id} not found`);
  const done = await repo.updateTask(id, { status: "done", completedAt: toLocalISO(now) });
  let next: Task | null = null;
  if (task.rrule && task.dueAt) {
    const start = new Date(task.dueAt);
    // Skip occurrences already in the past so an old overdue repeat doesn't spawn a backlog.
    const at = nextOccurrence(task.rrule, start, start > now ? start : now);
    if (at) {
      next = await repo.createTask({
        title: task.title,
        notes: task.notes,
        areaId: task.areaId,
        dueAt: toLocalISO(at),
        allDay: task.allDay,
        priority: task.priority,
        remind: task.remind,
        rrule: task.rrule,
        amount: task.amount,
        assignee: task.assignee,
        source: task.source,
        systemId: task.systemId,
      });
    }
  }
  return { done, next };
}

export async function reopenTask(repo: Repo, id: string): Promise<Task> {
  return repo.updateTask(id, { status: "open", completedAt: null });
}

/** Push the due time forward from now (or from the old due time if that is later). */
export async function snoozeTask(repo: Repo, id: string, minutes: number, now: Date): Promise<Task> {
  const task = await repo.getTask(id);
  if (!task) throw new Error(`Task ${id} not found`);
  const base = task.dueAt && new Date(task.dueAt) > now ? new Date(task.dueAt) : now;
  return repo.updateTask(id, { dueAt: toLocalISO(addMinutes(base, minutes)), allDay: false });
}

/** Resolve a full id or the 8-character reference the AI sees. */
export async function findTask(repo: Repo, ref: string): Promise<Task | null> {
  const clean = ref.replace(/^#/, "").trim().toLowerCase();
  if (!clean) return null;
  const exact = await repo.getTask(clean);
  if (exact) return exact;
  const all = await repo.listTasks({ includeDone: true });
  const matches = all.filter((t) => t.id.toLowerCase().startsWith(clean));
  return matches.length === 1 ? matches[0]! : null;
}

export const shortId = (id: string) => id.slice(0, 8);
