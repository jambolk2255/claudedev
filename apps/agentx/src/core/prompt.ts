import { shortId } from "./ops";
import { describeRule } from "./recurrence";
import { longDate, relativeLabel, toLocalISO } from "./time";
import type { Action, Area, Task } from "./types";
import { overdue, today, upcoming } from "./views";

/** Stable instructions (kept byte-identical between requests so the prompt prefix can be cached). */
export const SYSTEM_PROMPT = `You are Agent X, a voice assistant that manages the user's tasks, meetings, deadlines, bills and reminders on their phone. The user runs a digital agency in Sri Lanka and also handles another business, education, personal life and finances.

How to work:
- The user speaks Sinhala, English or a mix (Singlish). Speech-to-text may contain small mistakes; infer the intended meaning.
- Reply in the language the user used. If they used Sinhala or a mix, reply in natural, simple spoken Sinhala (English words for names and tech terms are fine).
- Your reply is read aloud. Keep it to one or two short sentences. No markdown, no lists with symbols, no emojis.
- Act directly with the tools. Don't ask for information you can reasonably default: area (guess from context), priority (normal), reminders (meetings: 30 minutes before; deadlines and bills: at the time).
- When something required is missing or ambiguous (no date for a deadline, which of several tasks), call ask_user with one short question and helpful options.
- Before deleting a task or running an action marked confirm=true, ask with ask_user (options: "ඔව්", "නෑ" or "Yes", "No") and only proceed after a yes.
- Resolve relative dates using the current time in the context: අද=today, හෙට=tomorrow, අනිද්දා=day after tomorrow, ලබන සතියේ=next week, උදේ=morning (09:00 unless a time is given), දවල්=noon, හවස=afternoon (16:00), රෑ=night (20:00). A bare hour such as "3ට" means the next sensible occurrence (3 PM for work, unless the user says උදේ).
- Refer to tasks by the 8-character ids in the context. "ඒක"/"that" means the task discussed last.
- After changes, confirm briefly what you did (e.g. "හරි, හෙට උදේ 10ට ABC meeting එක දැම්මා. 9ට මතක් කරනවා.").
- For "what do I have today" style questions, answer from the context; mention overdue items first. Read at most 5 items aloud.
- Connected system actions (n8n workflows) are listed in the context. Use run_action when the user asks for one; read the result back briefly.
- If a request is outside task management, answer helpfully in one or two sentences.`;

const fmt = (t: Task, now: Date, areas: Map<string, string>) => {
  const bits = [t.title];
  if (t.dueAt) bits.push(`due ${relativeLabel(t.dueAt, t.allDay, now, "en")} (${t.dueAt})`);
  if (t.areaId && areas.get(t.areaId)) bits.push(`area ${areas.get(t.areaId)}`);
  if (t.rrule) bits.push(`repeats ${describeRule(t.rrule, "en")}`);
  if (t.priority === "high") bits.push("high priority");
  if (t.amount) bits.push(`LKR ${t.amount}`);
  if (t.assignee) bits.push(`assignee ${t.assignee}`);
  if (t.status === "done") bits.push("DONE");
  return `- [${shortId(t.id)}] ${bits.join(" · ")}`;
};

/** Volatile context sent with each user message: time, areas, current tasks, actions. */
export function buildContext(opts: {
  now: Date;
  lang: "si" | "en";
  userName: string;
  areas: Area[];
  tasks: Task[];
  actions: (Action & { systemName: string })[];
}): string {
  const { now, lang, areas, tasks, actions } = opts;
  const areaNames = new Map(areas.map((a) => [a.id, a.name]));
  const od = overdue(tasks, now);
  const td = today(tasks, now);
  const up = upcoming(tasks, now, 7).flatMap((g) => g.tasks);
  const somedayCount = tasks.filter((t) => t.status === "open" && !t.dueAt).length;
  const lines = [
    `Current time: ${toLocalISO(now)} (${longDate(now, "en")}). Time zone offset is included above.`,
    `App language: ${lang === "si" ? "Sinhala" : "English"}.${opts.userName ? ` User's name: ${opts.userName}.` : ""}`,
    `Areas: ${areas.map((a) => a.name).join(", ") || "none"}.`,
    `Overdue (${od.length}):`,
    ...od.slice(0, 25).map((t) => fmt(t, now, areaNames)),
    `Today (${td.length}):`,
    ...td.slice(0, 30).map((t) => fmt(t, now, areaNames)),
    `Next 7 days (${up.length}):`,
    ...up.slice(0, 40).map((t) => fmt(t, now, areaNames)),
    `Tasks without a date: ${somedayCount} (use list_tasks to see them).`,
  ];
  const enabled = actions.filter((a) => a.enabled && !a.deletedAt);
  if (enabled.length) {
    lines.push("Actions (connected systems via n8n):");
    for (const a of enabled) {
      const params = a.params.map((p) => `${p.name}${p.required ? "*" : ""}${p.description ? ` (${p.description})` : ""}`).join(", ");
      lines.push(`- key=${a.key} · ${a.systemName}: ${a.name} — ${a.description}${params ? ` · params: ${params}` : ""}${a.confirm ? " · confirm=true" : ""}`);
    }
  } else {
    lines.push("Actions: none connected yet.");
  }
  return lines.join("\n");
}
