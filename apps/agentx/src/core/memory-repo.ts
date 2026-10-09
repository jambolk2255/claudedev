import { toLocalISO } from "./time";
import type { Action, Area, NewTask, Repo, Task } from "./types";

let counter = 0;
const uuid = () => `${(++counter).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

/** In-memory Repo for unit tests. */
export class MemoryRepo implements Repo {
  areas: Area[] = [];
  tasks: Task[] = [];
  actions: (Action & { systemName: string })[] = [];
  constructor(private clock: () => Date = () => new Date()) {}

  addArea(name: string, defaultRemind: number[] = [0]): Area {
    const now = toLocalISO(this.clock());
    const a: Area = { id: uuid(), name, icon: "", sort: this.areas.length, defaultRemind, createdAt: now, updatedAt: now, deletedAt: null };
    this.areas.push(a);
    return a;
  }

  async listAreas() {
    return this.areas.filter((a) => !a.deletedAt);
  }
  async listTasks(opts?: { includeDone?: boolean }) {
    return this.tasks.filter((t) => !t.deletedAt && (opts?.includeDone || t.status === "open" || t.completedAt));
  }
  async getTask(id: string) {
    return this.tasks.find((t) => t.id === id) ?? null;
  }
  async createTask(input: NewTask): Promise<Task> {
    const now = toLocalISO(this.clock());
    const t: Task = {
      id: uuid(),
      notes: "",
      areaId: null,
      dueAt: null,
      allDay: false,
      priority: "normal",
      status: "open",
      remind: [],
      rrule: null,
      amount: null,
      assignee: null,
      source: "app",
      systemId: null,
      completedAt: null,
      deletedAt: null,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(t);
    return t;
  }
  async updateTask(id: string, patch: Partial<Task>) {
    const i = this.tasks.findIndex((t) => t.id === id);
    if (i < 0) throw new Error("not found");
    const t = { ...this.tasks[i]!, ...patch, id, updatedAt: toLocalISO(this.clock()) };
    this.tasks[i] = t;
    return t;
  }
  async deleteTask(id: string) {
    await this.updateTask(id, { deletedAt: toLocalISO(this.clock()) });
  }
  async listActions() {
    return this.actions;
  }
}
