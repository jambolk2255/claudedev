/** n8n linkage: voice actions, outbound events (with an offline outbox), inbox polling and auto backup. */
import { actionBody, checkUrl, eventBody, makeBackup, parseInbox, readActionReply, withQuery } from "@/core/integration";
import { signBody } from "@/core/hmac";
import { toLocalISO } from "@/core/time";
import type { Action, Settings, System, Task, TaskEvent } from "@/core/types";
import { isOverdue } from "@/core/views";
import { enqueue, kvGet, kvSet, loadSettings, outboxDone, outboxFailed, pendingOutbox, repo, saveSettings } from "@/db";
import { scheduleTask, showNow } from "@/notifications";
import { translate } from "@/lib/i18n";

const TIMEOUT_MS = 20_000;

/** Refuses anything but HTTPS (or plain http on the local network). */
function safeUrl(raw: string): string {
  const res = checkUrl(raw);
  if (!res.ok) throw new Error(res.reason === "insecure" ? "Only https:// URLs are allowed" : "Invalid URL");
  return res.url;
}

async function post(rawUrl: string, body: string, secret: string): Promise<{ status: number; text: string }> {
  const url = safeUrl(rawUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "AgentX/0.1" };
    if (secret) headers["x-agentx-signature"] = signBody(secret, body);
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function markSystem(system: System, error: string | null) {
  await repo.saveSystem({ ...system, lastOkAt: error ? system.lastOkAt : toLocalISO(new Date()), lastError: error });
}

/** Runs a voice action (n8n webhook) and returns the text to speak. */
export async function runAction(action: Action & { systemName: string }, params: Record<string, string>, lang: "si" | "en") {
  const system = await repo.getSystem(action.systemId);
  try {
    const res = await post(action.url, actionBody(action, params, new Date()), system?.secret ?? "");
    const reply = readActionReply(res.status, res.text, lang);
    if (system) await markSystem(system, reply.ok ? null : reply.say);
    return reply;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (system) await markSystem(system, msg);
    return { ok: false, say: msg };
  }
}

/** Queues an event for every system subscribed to it, then tries to deliver. */
export async function emitEvent(event: TaskEvent, task: Task): Promise<void> {
  const systems = (await repo.listSystems()).filter((s) => s.eventsUrl && s.events.includes(event));
  if (!systems.length) return;
  const areas = await repo.listAreas();
  for (const s of systems) await enqueue(s.id, s.eventsUrl, eventBody(event, task, areas, new Date()));
  void flushOutbox();
}

let flushing = false;
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const systems = new Map((await repo.listSystems()).map((s) => [s.id, s]));
    for (const row of await pendingOutbox()) {
      const system = systems.get(row.system_id);
      if (!system) {
        await outboxDone(row.id);
        continue;
      }
      try {
        const res = await post(row.url, row.body, system.secret);
        if (res.status >= 200 && res.status < 300) {
          await outboxDone(row.id);
          await markSystem(system, null);
        } else {
          await outboxFailed(row.id, `HTTP ${res.status}`);
          await markSystem(system, `HTTP ${res.status}`);
        }
      } catch (e) {
        await outboxFailed(row.id, e instanceof Error ? e.message : String(e));
        break; // Probably offline — try again later.
      }
    }
  } finally {
    flushing = false;
  }
}

/** Pulls new items from one system's inbox URL. Returns how many tasks/notifications were added. */
export async function pollInbox(system: System, settings: Settings): Promise<number> {
  if (!system.inboxUrl) return 0;
  const startedAt = toLocalISO(new Date());
  try {
    const base = safeUrl(system.inboxUrl);
    const { url, query } = system.inboxSince ? withQuery(base, "since", system.inboxSince) : { url: base, query: "" };
    const headers: Record<string, string> = { accept: "application/json" };
    if (system.secret) headers["x-agentx-signature"] = signBody(system.secret, query);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseInbox(await res.json(), await repo.listAreas());
    let added = 0;
    for (const item of items) {
      if (item.type === "notify") {
        await showNow(settings, `${system.icon} ${item.title}`, item.body || `${translate(settings.lang, "notif.inbox")} ${system.name}`);
        added++;
        continue;
      }
      if (item.externalId && (await repo.findByExternalId(system.id, item.externalId))) continue;
      const task = await repo.createTask({ ...item.task, systemId: system.id });
      if (item.externalId) await repo.setExternalId(task.id, system.id, item.externalId);
      await scheduleTask(task, settings);
      await showNow(settings, `${system.icon} ${task.title}`, `${translate(settings.lang, "notif.inbox")} ${system.name}`, { taskId: task.id });
      added++;
    }
    await repo.saveSystem({ ...system, inboxSince: startedAt, lastOkAt: startedAt, lastError: null });
    return added;
  } catch (e) {
    await markSystem(system, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Sends `task.overdue` once per task when it becomes overdue. */
async function reportOverdue(): Promise<void> {
  const reported = new Set<string>(JSON.parse((await kvGet("overdue.reported")) ?? "[]") as string[]);
  const now = new Date();
  const overdue = (await repo.listTasks()).filter((t) => isOverdue(t, now));
  for (const t of overdue) if (!reported.has(t.id)) await emitEvent("task.overdue", t);
  // Keep only ids that are still overdue so the set stays small.
  await kvSet("overdue.reported", JSON.stringify(overdue.map((t) => t.id)));
}

export async function backupNow(settings: Settings): Promise<void> {
  if (!settings.backupUrl) throw new Error("No backup URL");
  const data = await repo.allForBackup();
  const body = JSON.stringify(makeBackup({ ...data, settings }, new Date()));
  const res = await post(settings.backupUrl, body, "");
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  await saveSettings({ lastBackupAt: toLocalISO(new Date()) });
}

/** Everything that should happen periodically: app open + background task. Errors per step are swallowed. */
export async function syncAll(): Promise<void> {
  const settings = await loadSettings();
  await flushOutbox().catch(() => {});
  for (const s of await repo.listSystems()) await pollInbox(s, settings).catch(() => {});
  await reportOverdue().catch(() => {});
  if (settings.autoBackup && settings.backupUrl) {
    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt).getTime() : 0;
    if (Date.now() - last > 20 * 3_600_000) await backupNow(settings).catch(() => {});
  }
}
