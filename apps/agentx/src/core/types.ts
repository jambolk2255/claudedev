/** Shared data types. Every record has a UUID and timestamps so a future sync server can merge them. */

export type Priority = "low" | "normal" | "high";
export type TaskStatus = "open" | "done";
export type TaskSource = "app" | "voice" | "inbox" | "action";

export interface Area {
  id: string;
  name: string;
  icon: string;
  sort: number;
  defaultRemind: number[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  areaId: string | null;
  /** ISO string with offset. Null = no date ("someday"). */
  dueAt: string | null;
  allDay: boolean;
  priority: Priority;
  status: TaskStatus;
  /** Minutes before `dueAt` to remind (0 = at the time). */
  remind: number[];
  /** Simple RRULE, e.g. `FREQ=WEEKLY;BYDAY=MO`. */
  rrule: string | null;
  amount: number | null;
  assignee: string | null;
  source: TaskSource;
  systemId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
}

export type TaskEvent = "task.created" | "task.completed" | "task.overdue";

export interface System {
  id: string;
  name: string;
  icon: string;
  /** Secret used to sign webhook bodies (HMAC-SHA256). */
  secret: string;
  eventsUrl: string;
  events: TaskEvent[];
  inboxUrl: string;
  inboxSince: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ActionParam {
  name: string;
  description: string;
  required: boolean;
}

export interface Action {
  id: string;
  systemId: string;
  /** Stable machine name sent to n8n, e.g. `client_onboarding`. */
  key: string;
  name: string;
  /** What the user would say — helps the AI pick the action. */
  description: string;
  url: string;
  params: ActionParam[];
  confirm: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Settings {
  lang: "si" | "en";
  theme: "dark" | "light" | "system";
  speak: boolean;
  speechRate: number;
  claudeModel: string;
  geminiModel: string;
  briefingTime: string;
  reviewTime: string;
  nagMinutes: number;
  quietStart: string;
  quietEnd: string;
  backupUrl: string;
  autoBackup: boolean;
  lastBackupAt: string | null;
  userName: string;
  /** Ask for fingerprint / phone PIN when opening the app. */
  appLock: boolean;
  /** Hide reminder details on the lock screen. */
  hideOnLockScreen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "si",
  theme: "dark",
  speak: true,
  speechRate: 1,
  claudeModel: "claude-opus-5-5",
  geminiModel: "gemini-2.5-flash",
  briefingTime: "07:00",
  reviewTime: "20:00",
  nagMinutes: 120,
  quietStart: "22:00",
  quietEnd: "06:00",
  backupUrl: "",
  autoBackup: false,
  lastBackupAt: null,
  userName: "",
  appLock: false,
  hideOnLockScreen: false,
};

export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
] as const;

export type NewTask = Partial<Omit<Task, "id" | "createdAt" | "updatedAt">> & { title: string };

/** Storage the core logic needs. Implemented by SQLite on the phone and in memory in tests. */
export interface Repo {
  listAreas(): Promise<Area[]>;
  listTasks(opts?: { includeDone?: boolean }): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: NewTask): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  listActions(): Promise<(Action & { systemName: string })[]>;
}
