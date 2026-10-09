import { randomUUID } from "expo-crypto";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { toLocalISO } from "@/core/time";
import { DEFAULT_SETTINGS, type Action, type Area, type NewTask, type Repo, type Settings, type System, type Task, type TaskEvent } from "@/core/types";

/** Schema migrations, applied in order. Never edit a released entry — append a new one. */
const MIGRATIONS = [
  `CREATE TABLE areas (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
     default_remind TEXT NOT NULL DEFAULT '[0]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
   CREATE TABLE tasks (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', area_id TEXT, due_at TEXT, all_day INTEGER NOT NULL DEFAULT 0,
     priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', remind TEXT NOT NULL DEFAULT '[]', rrule TEXT,
     amount REAL, assignee TEXT, source TEXT NOT NULL DEFAULT 'app', system_id TEXT, external_id TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, deleted_at TEXT);
   CREATE INDEX tasks_due ON tasks(status, due_at);
   CREATE TABLE systems (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '', secret TEXT NOT NULL DEFAULT '', events_url TEXT NOT NULL DEFAULT '',
     events TEXT NOT NULL DEFAULT '[]', inbox_url TEXT NOT NULL DEFAULT '', inbox_since TEXT, last_ok_at TEXT, last_error TEXT,
     sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
   CREATE TABLE actions (
     id TEXT PRIMARY KEY, system_id TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
     url TEXT NOT NULL, params TEXT NOT NULL DEFAULT '[]', confirm INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
   CREATE TABLE outbox (
     id TEXT PRIMARY KEY, system_id TEXT NOT NULL, url TEXT NOT NULL, body TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
     last_error TEXT, created_at TEXT NOT NULL);
   CREATE TABLE notif (task_id TEXT NOT NULL, notif_id TEXT NOT NULL, PRIMARY KEY (task_id, notif_id));
   CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE voice_log (
     id TEXT PRIMARY KEY, transcript TEXT NOT NULL, reply TEXT NOT NULL, tools TEXT NOT NULL DEFAULT '[]', ms INTEGER, created_at TEXT NOT NULL);`,
];

const SEED_AREAS: { name: string; icon: string; remind: number[] }[] = [
  { name: "Agency", icon: "💼", remind: [30] },
  { name: "Business", icon: "🏪", remind: [30] },
  { name: "Education", icon: "🎓", remind: [60] },
  { name: "Personal", icon: "🏠", remind: [15] },
  { name: "Finance", icon: "💳", remind: [0] },
];

let db: SQLiteDatabase | null = null;
const listeners = new Set<() => void>();

/** Components subscribe to re-query after any write. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notifyChange() {
  for (const fn of listeners) fn();
}

export async function openDb(): Promise<SQLiteDatabase> {
  if (db) return db;
  const d = await openDatabaseAsync("agentx.db");
  await d.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = await d.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  for (let v = version; v < MIGRATIONS.length; v++) {
    await d.withTransactionAsync(async () => {
      await d.execAsync(MIGRATIONS[v]!);
      await d.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  if (version === 0) {
    const now = toLocalISO(new Date());
    for (const [i, a] of SEED_AREAS.entries()) {
      await d.runAsync("INSERT INTO areas (id, name, icon, sort, default_remind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        randomUUID(),
        a.name,
        a.icon,
        i,
        JSON.stringify(a.remind),
        now,
        now,
      ]);
    }
  }
  db = d;
  return d;
}

const get = () => {
  if (!db) throw new Error("Database not opened");
  return db;
};
const now = () => toLocalISO(new Date());
const json = <T>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v));

const toArea = (r: Row): Area => ({
  id: String(r.id),
  name: String(r.name),
  icon: String(r.icon ?? ""),
  sort: Number(r.sort ?? 0),
  defaultRemind: json(str(r.default_remind), [0]),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  deletedAt: str(r.deleted_at),
});

const toTask = (r: Row): Task => ({
  id: String(r.id),
  title: String(r.title),
  notes: String(r.notes ?? ""),
  areaId: str(r.area_id),
  dueAt: str(r.due_at),
  allDay: !!r.all_day,
  priority: (r.priority as Task["priority"]) ?? "normal",
  status: (r.status as Task["status"]) ?? "open",
  remind: json(str(r.remind), []),
  rrule: str(r.rrule),
  amount: r.amount == null ? null : Number(r.amount),
  assignee: str(r.assignee),
  source: (r.source as Task["source"]) ?? "app",
  systemId: str(r.system_id),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  completedAt: str(r.completed_at),
  deletedAt: str(r.deleted_at),
});

const toSystem = (r: Row): System => ({
  id: String(r.id),
  name: String(r.name),
  icon: String(r.icon ?? ""),
  secret: String(r.secret ?? ""),
  eventsUrl: String(r.events_url ?? ""),
  events: json<TaskEvent[]>(str(r.events), []),
  inboxUrl: String(r.inbox_url ?? ""),
  inboxSince: str(r.inbox_since),
  lastOkAt: str(r.last_ok_at),
  lastError: str(r.last_error),
  sort: Number(r.sort ?? 0),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  deletedAt: str(r.deleted_at),
});

const toAction = (r: Row): Action => ({
  id: String(r.id),
  systemId: String(r.system_id),
  key: String(r.key),
  name: String(r.name),
  description: String(r.description ?? ""),
  url: String(r.url),
  params: json(str(r.params), []),
  confirm: !!r.confirm,
  enabled: !!r.enabled,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  deletedAt: str(r.deleted_at),
});

const TASK_COLS: Record<string, (t: Partial<Task>) => unknown> = {
  title: (t) => t.title,
  notes: (t) => t.notes,
  area_id: (t) => t.areaId,
  due_at: (t) => t.dueAt,
  all_day: (t) => (t.allDay === undefined ? undefined : t.allDay ? 1 : 0),
  priority: (t) => t.priority,
  status: (t) => t.status,
  remind: (t) => (t.remind === undefined ? undefined : JSON.stringify(t.remind)),
  rrule: (t) => t.rrule,
  amount: (t) => t.amount,
  assignee: (t) => t.assignee,
  source: (t) => t.source,
  system_id: (t) => t.systemId,
  completed_at: (t) => t.completedAt,
  deleted_at: (t) => t.deletedAt,
};

type Bind = string | number | null;
const bind = (v: unknown): Bind => (v === undefined ? null : (v as Bind));

export const repo: Repo & {
  saveArea(a: Partial<Area> & { name: string }): Promise<Area>;
  deleteArea(id: string): Promise<void>;
  reorderAreas(ids: string[]): Promise<void>;
  listSystems(): Promise<System[]>;
  getSystem(id: string): Promise<System | null>;
  saveSystem(s: Partial<System> & { name: string }): Promise<System>;
  deleteSystem(id: string): Promise<void>;
  actionsFor(systemId: string): Promise<Action[]>;
  saveAction(a: Partial<Action> & { systemId: string; name: string; url: string }): Promise<Action>;
  deleteAction(id: string): Promise<void>;
  findByExternalId(systemId: string, externalId: string): Promise<Task | null>;
  setExternalId(taskId: string, systemId: string, externalId: string): Promise<void>;
  allForBackup(): Promise<{ areas: Area[]; tasks: Task[]; systems: System[]; actions: Action[] }>;
  restore(data: { areas: Area[]; tasks: Task[]; systems: Omit<System, "secret">[]; actions: Action[] }): Promise<void>;
} = {
  async listAreas() {
    const rows = await get().getAllAsync<Row>("SELECT * FROM areas WHERE deleted_at IS NULL ORDER BY sort, name");
    return rows.map(toArea);
  },
  async saveArea(a) {
    const t = now();
    if (a.id) {
      await get().runAsync("UPDATE areas SET name = ?, icon = ?, default_remind = ?, updated_at = ? WHERE id = ?", [
        a.name,
        a.icon ?? "",
        JSON.stringify(a.defaultRemind ?? [0]),
        t,
        a.id,
      ]);
    } else {
      a = { ...a, id: randomUUID() };
      const max = await get().getFirstAsync<{ m: number | null }>("SELECT MAX(sort) AS m FROM areas");
      await get().runAsync("INSERT INTO areas (id, name, icon, sort, default_remind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        a.id!,
        a.name,
        a.icon ?? "",
        (max?.m ?? -1) + 1,
        JSON.stringify(a.defaultRemind ?? [0]),
        t,
        t,
      ]);
    }
    notifyChange();
    return toArea((await get().getFirstAsync<Row>("SELECT * FROM areas WHERE id = ?", [a.id!]))!);
  },
  async deleteArea(id) {
    const t = now();
    await get().runAsync("UPDATE areas SET deleted_at = ?, updated_at = ? WHERE id = ?", [t, t, id]);
    await get().runAsync("UPDATE tasks SET area_id = NULL, updated_at = ? WHERE area_id = ?", [t, id]);
    notifyChange();
  },
  async reorderAreas(ids) {
    await get().withTransactionAsync(async () => {
      for (const [i, id] of ids.entries()) await get().runAsync("UPDATE areas SET sort = ? WHERE id = ?", [i, id]);
    });
    notifyChange();
  },

  async listTasks(opts) {
    const rows = await get().getAllAsync<Row>(
      opts?.includeDone
        ? "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY due_at IS NULL, due_at"
        : // Done tasks from the last 2 days are kept so "done today" still shows.
          "SELECT * FROM tasks WHERE deleted_at IS NULL AND (status = 'open' OR completed_at >= ?) ORDER BY due_at IS NULL, due_at",
      opts?.includeDone ? [] : [toLocalISO(new Date(Date.now() - 2 * 86_400_000))],
    );
    return rows.map(toTask);
  },
  async getTask(id) {
    const r = await get().getFirstAsync<Row>("SELECT * FROM tasks WHERE id = ?", [id]);
    return r ? toTask(r) : null;
  },
  async createTask(input: NewTask) {
    const id = randomUUID();
    const t = now();
    const full: Partial<Task> = { notes: "", allDay: false, priority: "normal", status: "open", remind: [], source: "app", ...input };
    const cols = Object.keys(TASK_COLS).filter((c) => TASK_COLS[c]!(full) !== undefined);
    await get().runAsync(`INSERT INTO tasks (id, ${cols.join(", ")}, created_at, updated_at) VALUES (?, ${cols.map(() => "?").join(", ")}, ?, ?)`, [
      id,
      ...cols.map((c) => bind(TASK_COLS[c]!(full))),
      t,
      t,
    ]);
    notifyChange();
    return (await this.getTask(id))!;
  },
  async updateTask(id, patch) {
    const cols = Object.keys(TASK_COLS).filter((c) => TASK_COLS[c]!(patch) !== undefined);
    if (cols.length) {
      await get().runAsync(`UPDATE tasks SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`, [
        ...cols.map((c) => bind(TASK_COLS[c]!(patch))),
        now(),
        id,
      ]);
      notifyChange();
    }
    const task = await this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);
    return task;
  },
  async deleteTask(id) {
    const t = now();
    await get().runAsync("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?", [t, t, id]);
    notifyChange();
  },
  async findByExternalId(systemId, externalId) {
    const r = await get().getFirstAsync<Row>("SELECT * FROM tasks WHERE system_id = ? AND external_id = ?", [systemId, externalId]);
    return r ? toTask(r) : null;
  },
  async setExternalId(taskId, systemId, externalId) {
    await get().runAsync("UPDATE tasks SET system_id = ?, external_id = ? WHERE id = ?", [systemId, externalId, taskId]);
  },

  async listSystems() {
    return (await get().getAllAsync<Row>("SELECT * FROM systems WHERE deleted_at IS NULL ORDER BY sort, name")).map(toSystem);
  },
  async getSystem(id) {
    const r = await get().getFirstAsync<Row>("SELECT * FROM systems WHERE id = ?", [id]);
    return r ? toSystem(r) : null;
  },
  async saveSystem(s) {
    const t = now();
    const id = s.id ?? randomUUID();
    const existing = s.id ? await this.getSystem(s.id) : null;
    const v = { ...(existing ?? {}), ...s } as Partial<System>;
    await get().runAsync(
      `INSERT INTO systems (id, name, icon, secret, events_url, events, inbox_url, inbox_since, last_ok_at, last_error, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, secret = excluded.secret, events_url = excluded.events_url,
         events = excluded.events, inbox_url = excluded.inbox_url, inbox_since = excluded.inbox_since, last_ok_at = excluded.last_ok_at,
         last_error = excluded.last_error, updated_at = excluded.updated_at`,
      [
        id,
        v.name!,
        v.icon ?? "⚡",
        v.secret ?? "",
        v.eventsUrl ?? "",
        JSON.stringify(v.events ?? []),
        v.inboxUrl ?? "",
        v.inboxSince ?? null,
        v.lastOkAt ?? null,
        v.lastError ?? null,
        v.sort ?? 0,
        existing?.createdAt ?? t,
        t,
      ],
    );
    notifyChange();
    return (await this.getSystem(id))!;
  },
  async deleteSystem(id) {
    const t = now();
    await get().runAsync("UPDATE systems SET deleted_at = ?, updated_at = ? WHERE id = ?", [t, t, id]);
    await get().runAsync("UPDATE actions SET deleted_at = ?, updated_at = ? WHERE system_id = ?", [t, t, id]);
    notifyChange();
  },

  async listActions() {
    const rows = await get().getAllAsync<Row>(
      "SELECT a.*, s.name AS system_name FROM actions a JOIN systems s ON s.id = a.system_id WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY s.sort, a.name",
    );
    return rows.map((r) => ({ ...toAction(r), systemName: String(r.system_name) }));
  },
  async actionsFor(systemId) {
    return (await get().getAllAsync<Row>("SELECT * FROM actions WHERE system_id = ? AND deleted_at IS NULL ORDER BY name", [systemId])).map(toAction);
  },
  async saveAction(a) {
    const t = now();
    const id = a.id ?? randomUUID();
    const key =
      a.key?.trim() ||
      a.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") ||
      `action_${id.slice(0, 6)}`;
    await get().runAsync(
      `INSERT INTO actions (id, system_id, key, name, description, url, params, confirm, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET key = excluded.key, name = excluded.name, description = excluded.description, url = excluded.url,
         params = excluded.params, confirm = excluded.confirm, enabled = excluded.enabled, updated_at = excluded.updated_at`,
      [id, a.systemId, key, a.name, a.description ?? "", a.url, JSON.stringify(a.params ?? []), a.confirm ? 1 : 0, a.enabled === false ? 0 : 1, t, t],
    );
    notifyChange();
    return toAction((await get().getFirstAsync<Row>("SELECT * FROM actions WHERE id = ?", [id]))!);
  },
  async deleteAction(id) {
    const t = now();
    await get().runAsync("UPDATE actions SET deleted_at = ?, updated_at = ? WHERE id = ?", [t, t, id]);
    notifyChange();
  },

  async allForBackup() {
    const d = get();
    return {
      areas: (await d.getAllAsync<Row>("SELECT * FROM areas")).map(toArea),
      tasks: (await d.getAllAsync<Row>("SELECT * FROM tasks WHERE deleted_at IS NULL")).map(toTask),
      systems: (await d.getAllAsync<Row>("SELECT * FROM systems WHERE deleted_at IS NULL")).map(toSystem),
      actions: (await d.getAllAsync<Row>("SELECT * FROM actions WHERE deleted_at IS NULL")).map(toAction),
    };
  },
  /** Replaces all data with a backup. Secrets are not in backups, so existing system secrets are kept by id. */
  async restore(data) {
    const d = get();
    const secrets = new Map((await this.listSystems()).map((s) => [s.id, s.secret]));
    await d.withTransactionAsync(async () => {
      await d.execAsync("DELETE FROM areas; DELETE FROM tasks; DELETE FROM systems; DELETE FROM actions; DELETE FROM notif; DELETE FROM outbox;");
      for (const a of data.areas)
        await d.runAsync("INSERT INTO areas (id, name, icon, sort, default_remind, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
          a.id,
          a.name,
          a.icon,
          a.sort,
          JSON.stringify(a.defaultRemind ?? [0]),
          a.createdAt,
          a.updatedAt,
          a.deletedAt,
        ]);
      for (const t of data.tasks) {
        const cols = Object.keys(TASK_COLS);
        await d.runAsync(`INSERT INTO tasks (id, ${cols.join(", ")}, created_at, updated_at) VALUES (?, ${cols.map(() => "?").join(", ")}, ?, ?)`, [
          t.id,
          ...cols.map((c) => bind(TASK_COLS[c]!(t))),
          t.createdAt,
          t.updatedAt,
        ]);
      }
      for (const s of data.systems)
        await d.runAsync(
          "INSERT INTO systems (id, name, icon, secret, events_url, events, inbox_url, inbox_since, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            s.id,
            s.name,
            s.icon,
            secrets.get(s.id) ?? "",
            s.eventsUrl,
            JSON.stringify(s.events ?? []),
            s.inboxUrl,
            s.inboxSince,
            s.sort,
            s.createdAt,
            s.updatedAt,
          ],
        );
      for (const a of data.actions)
        await d.runAsync(
          "INSERT INTO actions (id, system_id, key, name, description, url, params, confirm, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            a.id,
            a.systemId,
            a.key,
            a.name,
            a.description,
            a.url,
            JSON.stringify(a.params ?? []),
            a.confirm ? 1 : 0,
            a.enabled ? 1 : 0,
            a.createdAt,
            a.updatedAt,
          ],
        );
    });
    notifyChange();
  },
};

/* ---------- settings (key/value) ---------- */

export async function loadSettings(): Promise<Settings> {
  const rows = await get().getAllAsync<{ key: string; value: string }>("SELECT key, value FROM kv WHERE key LIKE 'settings.%'");
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key.slice("settings.".length)] = json(r.value, null);
  return s as unknown as Settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await get().withTransactionAsync(async () => {
    for (const [k, v] of Object.entries(patch))
      await get().runAsync("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
        `settings.${k}`,
        JSON.stringify(v),
      ]);
  });
}

/* ---------- notification ids per task ---------- */

export async function notifIds(taskId: string): Promise<string[]> {
  return (await get().getAllAsync<{ notif_id: string }>("SELECT notif_id FROM notif WHERE task_id = ?", [taskId])).map((r) => r.notif_id);
}
export async function setNotifIds(taskId: string, ids: string[]): Promise<void> {
  await get().runAsync("DELETE FROM notif WHERE task_id = ?", [taskId]);
  for (const id of ids) await get().runAsync("INSERT OR IGNORE INTO notif (task_id, notif_id) VALUES (?, ?)", [taskId, id]);
}
export async function clearAllNotifIds(): Promise<void> {
  await get().runAsync("DELETE FROM notif");
}

/* ---------- outbox (webhooks waiting to be delivered) ---------- */

export interface OutboxRow {
  id: string;
  system_id: string;
  url: string;
  body: string;
  attempts: number;
}
export async function enqueue(systemId: string, url: string, body: string): Promise<void> {
  await get().runAsync("INSERT INTO outbox (id, system_id, url, body, created_at) VALUES (?, ?, ?, ?, ?)", [randomUUID(), systemId, url, body, now()]);
}
export async function pendingOutbox(): Promise<OutboxRow[]> {
  return get().getAllAsync<OutboxRow>("SELECT id, system_id, url, body, attempts FROM outbox ORDER BY created_at LIMIT 50");
}
export async function outboxDone(id: string): Promise<void> {
  await get().runAsync("DELETE FROM outbox WHERE id = ?", [id]);
}
export async function outboxFailed(id: string, error: string): Promise<void> {
  // Give up after 20 attempts so one broken URL can't grow the queue forever.
  await get().runAsync("UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?", [error, id]);
  await get().runAsync("DELETE FROM outbox WHERE attempts >= 20");
}

/* ---------- misc key/value + voice log ---------- */

export async function kvGet(key: string): Promise<string | null> {
  return (await get().getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]))?.value ?? null;
}
export async function kvSet(key: string, value: string): Promise<void> {
  await get().runAsync("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

export async function logVoice(transcript: string, reply: string, tools: string[], ms: number): Promise<void> {
  await get().runAsync("INSERT INTO voice_log (id, transcript, reply, tools, ms, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    randomUUID(),
    transcript,
    reply,
    JSON.stringify(tools),
    ms,
    now(),
  ]);
  await get().runAsync("DELETE FROM voice_log WHERE id NOT IN (SELECT id FROM voice_log ORDER BY created_at DESC LIMIT 200)");
}
