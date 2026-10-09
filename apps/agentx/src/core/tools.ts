import { briefingText } from "./briefing";
import { completeTask, findTask, shortId, snoozeTask } from "./ops";
import { parseRule } from "./recurrence";
import { parseWhen, relativeLabel, toLocalISO } from "./time";
import type { Action, Area, Priority, Repo, Task } from "./types";
import { overdue, today, upcoming } from "./views";

/** Provider-neutral tool definition (JSON Schema input). Claude takes it as-is; Gemini gets a converted copy. */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required: string[] = []): ToolDef["input_schema"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const taskFields = {
  title: str("Short task title in the user's language."),
  notes: str("Extra details, optional."),
  area: str("Area name, e.g. Agency, Business, Education, Personal, Finance — pick the best match from the context."),
  due: str("When it is due: ISO 8601 local time with offset (2026-10-10T10:00:00+05:30) or a date (2026-10-10) for all-day."),
  priority: { type: "string", enum: ["low", "normal", "high"] },
  remind_minutes: { type: "array", items: { type: "integer" }, description: "Minutes before `due` to remind. 0 = at the time. E.g. [60] = one hour before." },
  repeat: str("RRULE for repeating tasks, e.g. FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO, FREQ=MONTHLY;BYMONTHDAY=25, FREQ=WEEKLY;INTERVAL=2;BYDAY=FR."),
  amount: { type: "number", description: "Money amount in LKR for bills/payments." },
  assignee: str("Name of the person doing it, if not the user."),
};

export const TOOLS: ToolDef[] = [
  {
    name: "create_task",
    description: "Create a task, meeting, deadline, bill or reminder. Use `repeat` for recurring ones.",
    input_schema: obj(taskFields, ["title"]),
  },
  {
    name: "update_task",
    description: "Change fields of an existing task. Only pass the fields that change.",
    input_schema: obj({ task_id: str("Task id from the context (8 characters)."), ...taskFields }, ["task_id"]),
  },
  {
    name: "complete_task",
    description: "Mark a task as done. Repeating tasks automatically get their next occurrence.",
    input_schema: obj({ task_id: str("Task id from the context.") }, ["task_id"]),
  },
  {
    name: "reschedule_task",
    description: "Move a task to a new date/time.",
    input_schema: obj({ task_id: str("Task id."), due: taskFields.due }, ["task_id", "due"]),
  },
  {
    name: "snooze_task",
    description: "Remind again later: pushes the task's time forward by some minutes.",
    input_schema: obj({ task_id: str("Task id."), minutes: { type: "integer", description: "Minutes to snooze, e.g. 60." } }, ["task_id", "minutes"]),
  },
  {
    name: "delete_task",
    description: "Delete a task permanently. First ask the user to confirm with ask_user; call with confirmed=true only after they said yes.",
    input_schema: obj({ task_id: str("Task id."), confirmed: { type: "boolean" } }, ["task_id", "confirmed"]),
  },
  {
    name: "list_tasks",
    description: "Look up tasks when the context list is not enough (e.g. done tasks, a search, another week).",
    input_schema: obj(
      {
        view: { type: "string", enum: ["today", "overdue", "upcoming", "done_today", "search", "area"] },
        query: str("Text to search in titles (view=search) or the area name (view=area)."),
      },
      ["view"],
    ),
  },
  {
    name: "get_briefing",
    description: "Get today's briefing text (today's tasks + overdue) to read out to the user.",
    input_schema: obj({}),
  },
  {
    name: "run_action",
    description:
      "Run one of the user's connected system actions (n8n workflows) listed in the context under 'actions'. If that action is marked confirm=true, ask the user first and pass confirmed=true only after they agree.",
    input_schema: obj(
      {
        action_key: str("The action key from the context."),
        params: { type: "object", description: "Values for the action's parameters.", additionalProperties: { type: "string" } },
        confirmed: { type: "boolean" },
      },
      ["action_key"],
    ),
  },
  {
    name: "ask_user",
    description:
      "Ask the user a question and wait for their spoken answer (missing time, which task, yes/no confirmation). Use one short question. Give 2-4 short answer options when they help.",
    input_schema: obj({ question: str("The question, in the user's language."), options: { type: "array", items: { type: "string" } } }, ["question"]),
  },
];

export interface ToolCard {
  icon: string;
  title: string;
  subtitle: string;
  taskId?: string;
}

export interface ToolResult {
  /** JSON text returned to the model. */
  content: string;
  isError?: boolean;
  card?: ToolCard;
}

export interface ToolContext {
  repo: Repo;
  now: Date;
  lang: "si" | "en";
  userName?: string;
  /** Called after a task is created/changed so notifications and webhooks can follow. */
  onTaskChange?: (task: Task, kind: "created" | "updated" | "completed" | "deleted") => Promise<void> | void;
  runAction?: (action: Action & { systemName: string }, params: Record<string, string>) => Promise<{ say: string; ok: boolean }>;
}

type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
const ok = (data: unknown, card?: ToolCard): ToolResult => ({ content: JSON.stringify({ ok: true, ...(data as object) }), card });
const fail = (error: string): ToolResult => ({ content: JSON.stringify({ ok: false, error }), isError: true });

function resolveArea(areas: Area[], name: string | undefined): string | null | undefined {
  if (name === undefined) return undefined;
  const n = name.toLowerCase();
  const hit = areas.find((a) => a.name.toLowerCase() === n) ?? areas.find((a) => a.name.toLowerCase().includes(n) || n.includes(a.name.toLowerCase()));
  return hit ? hit.id : null;
}

/** Converts tool input into task fields; returns an error string for invalid values. */
function taskPatch(input: Input, areas: Area[]): Partial<Task> | string {
  const patch: Partial<Task> = {};
  if (s(input.title)) patch.title = s(input.title)!;
  if (input.notes !== undefined) patch.notes = s(input.notes) ?? "";
  const areaId = resolveArea(areas, s(input.area));
  if (areaId !== undefined) patch.areaId = areaId;
  if (input.due !== undefined) {
    const when = parseWhen(s(input.due));
    if (!when) return `Invalid due "${String(input.due)}". Use ISO 8601 like 2026-10-10T10:00:00+05:30.`;
    patch.dueAt = toLocalISO(when.date);
    patch.allDay = when.allDay;
  }
  if (input.priority && ["low", "normal", "high"].includes(String(input.priority))) patch.priority = input.priority as Priority;
  if (Array.isArray(input.remind_minutes)) patch.remind = input.remind_minutes.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  if (input.repeat !== undefined) {
    const r = s(input.repeat);
    if (r && !parseRule(r)) return `Invalid repeat rule "${r}".`;
    patch.rrule = r || null;
  }
  if (input.amount !== undefined) patch.amount = Number(input.amount) || null;
  if (input.assignee !== undefined) patch.assignee = s(input.assignee) || null;
  return patch;
}

const brief = (t: Task, now: Date, lang: "si" | "en") => ({
  id: shortId(t.id),
  title: t.title,
  due: t.dueAt ? relativeLabel(t.dueAt, t.allDay, now, lang) : null,
  status: t.status,
});

export async function executeTool(name: string, input: Input, ctx: ToolContext): Promise<ToolResult> {
  const { repo, now, lang } = ctx;
  const when = (t: Task) => (t.dueAt ? relativeLabel(t.dueAt, t.allDay, now, lang) : lang === "si" ? "දිනයක් නෑ" : "No date");
  const needTask = async () => {
    const t = await findTask(repo, s(input.task_id) ?? "");
    return t && !t.deletedAt ? t : null;
  };

  switch (name) {
    case "create_task": {
      const areas = await repo.listAreas();
      const patch = taskPatch(input, areas);
      if (typeof patch === "string") return fail(patch);
      if (!patch.title) return fail("title is required");
      if (patch.dueAt && !patch.remind) {
        const area = areas.find((a) => a.id === patch.areaId);
        patch.remind = patch.allDay ? [] : (area?.defaultRemind ?? [0]);
      }
      const task = await repo.createTask({ ...patch, title: patch.title, source: "voice" });
      await ctx.onTaskChange?.(task, "created");
      return ok({ task: brief(task, now, lang) }, { icon: task.rrule ? "repeat" : "add-circle", title: task.title, subtitle: when(task), taskId: task.id });
    }
    case "update_task":
    case "reschedule_task": {
      const task = await needTask();
      if (!task) return fail("Task not found. Check the id in the context or use list_tasks.");
      const patch = taskPatch({ ...input, title: input.title }, await repo.listAreas());
      if (typeof patch === "string") return fail(patch);
      const updated = await repo.updateTask(task.id, patch);
      await ctx.onTaskChange?.(updated, "updated");
      return ok({ task: brief(updated, now, lang) }, { icon: "create", title: updated.title, subtitle: when(updated), taskId: updated.id });
    }
    case "complete_task": {
      const task = await needTask();
      if (!task) return fail("Task not found.");
      if (task.status === "done") return ok({ already_done: true, task: brief(task, now, lang) });
      const { done, next } = await completeTask(repo, task.id, now);
      await ctx.onTaskChange?.(done, "completed");
      if (next) await ctx.onTaskChange?.(next, "created");
      const left = today(await repo.listTasks(), now).filter((t) => t.status === "open").length + overdue(await repo.listTasks(), now).length;
      return ok(
        { task: brief(done, now, lang), next_occurrence: next ? when(next) : null, open_left_today: left },
        {
          icon: "checkmark-circle",
          title: done.title,
          subtitle: next ? `${lang === "si" ? "ඊළඟ වතාව" : "Next"}: ${when(next)}` : lang === "si" ? "ඉවරයි" : "Done",
          taskId: done.id,
        },
      );
    }
    case "snooze_task": {
      const task = await needTask();
      if (!task) return fail("Task not found.");
      const minutes = Math.max(1, Number(input.minutes) || 60);
      const updated = await snoozeTask(repo, task.id, minutes, now);
      await ctx.onTaskChange?.(updated, "updated");
      return ok({ task: brief(updated, now, lang) }, { icon: "alarm", title: updated.title, subtitle: when(updated), taskId: updated.id });
    }
    case "delete_task": {
      const task = await needTask();
      if (!task) return fail("Task not found.");
      if (input.confirmed !== true) return fail("Not confirmed. Ask the user with ask_user first, then call again with confirmed=true.");
      await repo.deleteTask(task.id);
      await ctx.onTaskChange?.(task, "deleted");
      return ok({ deleted: task.title }, { icon: "trash", title: task.title, subtitle: lang === "si" ? "මැකුවා" : "Deleted" });
    }
    case "list_tasks": {
      const all = await repo.listTasks({ includeDone: true });
      const q = (s(input.query) ?? "").toLowerCase();
      let list: Task[];
      switch (input.view) {
        case "overdue":
          list = overdue(all, now);
          break;
        case "upcoming":
          list = upcoming(all, now, 14).flatMap((g) => g.tasks);
          break;
        case "done_today":
          list = today(all, now).filter((t) => t.status === "done");
          break;
        case "search":
          list = all.filter((t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q));
          break;
        case "area": {
          const areaId = resolveArea(await repo.listAreas(), q);
          list = all.filter((t) => t.status === "open" && t.areaId === areaId);
          break;
        }
        default:
          list = [...overdue(all, now), ...today(all, now)];
      }
      return ok({ count: list.length, tasks: list.slice(0, 30).map((t) => brief(t, now, lang)) });
    }
    case "get_briefing":
      return ok({ text: briefingText(await repo.listTasks({ includeDone: true }), now, lang, ctx.userName) });
    case "run_action": {
      const key = s(input.action_key) ?? "";
      const action = (await repo.listActions()).find((a) => a.key === key && a.enabled && !a.deletedAt);
      if (!action) return fail(`Unknown action "${key}".`);
      if (action.confirm && input.confirmed !== true)
        return fail("This action needs confirmation. Ask the user with ask_user, then call again with confirmed=true.");
      const params = Object.fromEntries(Object.entries((input.params as Record<string, unknown>) ?? {}).map(([k, v]) => [k, String(v)]));
      const missing = action.params.filter((p) => p.required && !params[p.name]);
      if (missing.length) return fail(`Missing parameters: ${missing.map((p) => p.name).join(", ")}. Ask the user.`);
      if (!ctx.runAction) return fail("Actions are not available.");
      const res = await ctx.runAction(action, params);
      return res.ok
        ? ok({ say: res.say }, { icon: "flash", title: `${action.systemName} · ${action.name}`, subtitle: res.say })
        : fail(`The system returned an error: ${res.say}`);
    }
    default:
      return fail(`Unknown tool ${name}`);
  }
}
