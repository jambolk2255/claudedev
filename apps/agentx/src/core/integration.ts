/** Payload shapes exchanged with n8n (see docs/agentx/PLAN.md → Payload formats). Pure functions, no I/O. */
import { parseWhen, toLocalISO } from "./time";
import type { Action, Area, NewTask, Settings, System, Task, TaskEvent } from "./types";

export const APP_ID = "agentx";

/**
 * Webhook URLs must use HTTPS so task data and signatures are encrypted in transit. Plain http is only
 * accepted for addresses on the local network (e.g. n8n on the office LAN), never over the internet.
 * Parsed by hand because React Native's URL class doesn't reject malformed input.
 */
export function checkUrl(raw: string): { ok: true; url: string } | { ok: false; reason: "invalid" | "insecure" } {
  const url = raw.trim();
  const m = /^(https?):\/\/([a-z0-9.-]+)(:\d{1,5})?([/?#][^\s]*)?$/i.exec(url);
  if (!m || m[2]!.startsWith(".") || m[2]!.endsWith(".") || m[2]!.includes("..")) return { ok: false, reason: "invalid" };
  if (m[1]!.toLowerCase() === "https") return { ok: true, url };
  const h = m[2]!.toLowerCase();
  const local =
    h === "localhost" ||
    h.endsWith(".local") ||
    /^127\.\d+\.\d+\.\d+$/.test(h) ||
    /^10\.\d+\.\d+\.\d+$/.test(h) ||
    /^192\.168\.\d+\.\d+$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h);
  return local ? { ok: true, url } : { ok: false, reason: "insecure" };
}

/** Appends `key=value` to a URL's query string (keeps any existing query and drops a #fragment). */
export function withQuery(url: string, key: string, value: string): { url: string; query: string } {
  const base = url.split("#")[0]!;
  const pair = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  const full = base.includes("?") ? `${base}&${pair}` : `${base}?${pair}`;
  return { url: full, query: full.slice(full.indexOf("?")) };
}

export function taskPayload(t: Task, areas: Area[]) {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    area: areas.find((a) => a.id === t.areaId)?.name ?? null,
    dueAt: t.dueAt,
    allDay: t.allDay,
    priority: t.priority,
    status: t.status,
    repeat: t.rrule,
    amount: t.amount,
    assignee: t.assignee,
    completedAt: t.completedAt,
  };
}

export function eventBody(event: TaskEvent, t: Task, areas: Area[], now: Date): string {
  return JSON.stringify({ app: APP_ID, event, task: taskPayload(t, areas), sentAt: toLocalISO(now) });
}

export function actionBody(action: Action, params: Record<string, string>, now: Date): string {
  return JSON.stringify({ app: APP_ID, action: action.key, params, sentAt: toLocalISO(now) });
}

/** n8n may answer with `{ say }`, `{ message }`, a plain string, or anything else. */
export function readActionReply(status: number, text: string, lang: "si" | "en"): { ok: boolean; say: string } {
  const okStatus = status >= 200 && status < 300;
  let say = "";
  try {
    const json = JSON.parse(text) as unknown;
    const first = Array.isArray(json) ? json[0] : json;
    if (typeof first === "string") say = first;
    else if (first && typeof first === "object") {
      const o = first as Record<string, unknown>;
      say = String(o.say ?? o.message ?? o.text ?? o.result ?? "");
    }
  } catch {
    say = text.slice(0, 300);
  }
  if (!say) say = okStatus ? (lang === "si" ? "හරි, වැඩේ කළා." : "Done.") : `HTTP ${status}`;
  return { ok: okStatus, say };
}

export type InboxItem = { type: "task"; task: NewTask; externalId?: string } | { type: "notify"; title: string; body: string };

/** Validates items returned by an inbox webhook. Unknown or malformed entries are skipped. */
export function parseInbox(raw: unknown, areas: Area[]): InboxItem[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : [];
  const out: InboxItem[] = [];
  for (const item of list.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    if (o.type === "notify") {
      out.push({ type: "notify", title, body: typeof o.body === "string" ? o.body : "" });
      continue;
    }
    if (o.type !== undefined && o.type !== "task") continue;
    const when = parseWhen(typeof o.dueAt === "string" ? o.dueAt : typeof o.due === "string" ? o.due : null);
    const areaName = typeof o.area === "string" ? o.area.toLowerCase() : "";
    const area = areaName ? areas.find((a) => a.name.toLowerCase() === areaName) : undefined;
    out.push({
      type: "task",
      externalId: typeof o.id === "string" ? o.id : undefined,
      task: {
        title,
        notes: typeof o.notes === "string" ? o.notes : "",
        dueAt: when ? toLocalISO(when.date) : null,
        allDay: when?.allDay ?? false,
        areaId: area?.id ?? null,
        priority: o.priority === "high" || o.priority === "low" ? o.priority : "normal",
        remind: when && !when.allDay ? [0] : [],
        amount: typeof o.amount === "number" ? o.amount : null,
        assignee: typeof o.assignee === "string" ? o.assignee : null,
        source: "inbox",
      },
    });
  }
  return out;
}

export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof APP_ID;
  version: number;
  exportedAt: string;
  areas: Area[];
  tasks: Task[];
  systems: Omit<System, "secret">[];
  actions: Action[];
  settings: Partial<Settings>;
}

/** Secrets (system secrets, API keys) never go into a backup. */
export function makeBackup(data: { areas: Area[]; tasks: Task[]; systems: System[]; actions: Action[]; settings: Settings }, now: Date): Backup {
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: toLocalISO(now),
    areas: data.areas,
    tasks: data.tasks,
    systems: data.systems.map(({ secret: _secret, ...rest }) => rest),
    actions: data.actions,
    settings: data.settings,
  };
}

export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Not a valid backup file (JSON).");
  }
  const b = json as Partial<Backup>;
  if (b.app !== APP_ID || typeof b.version !== "number") throw new Error("This file is not an Agent X backup.");
  if (b.version > BACKUP_VERSION) throw new Error("This backup is from a newer version of Agent X.");
  if (!Array.isArray(b.tasks) || !Array.isArray(b.areas)) throw new Error("Backup is missing tasks or areas.");
  return {
    app: APP_ID,
    version: b.version,
    exportedAt: String(b.exportedAt ?? ""),
    areas: b.areas,
    tasks: b.tasks,
    systems: Array.isArray(b.systems) ? b.systems : [],
    actions: Array.isArray(b.actions) ? b.actions : [],
    settings: b.settings && typeof b.settings === "object" ? b.settings : {},
  };
}
