import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { briefingText, headline, reviewText } from "./briefing";
import { signBody } from "./hmac";
import { makeBackup, parseBackup, parseInbox, readActionReply } from "./integration";
import { MemoryRepo } from "./memory-repo";
import { completeTask, findTask, shortId, snoozeTask } from "./ops";
import { buildContext } from "./prompt";
import { describeRule, nextOccurrence, parseRule } from "./recurrence";
import { afterQuietHours, inQuietHours, parseWhen, relativeLabel, toLocalISO } from "./time";
import { executeTool, TOOLS } from "./tools";
import { DEFAULT_SETTINGS } from "./types";
import { isOverdue, overdue, today, upcoming } from "./views";

// Friday 9 Oct 2026, 08:30 local.
const NOW = new Date(2026, 9, 9, 8, 30);
const at = (d: number, h: number, m = 0) => toLocalISO(new Date(2026, 9, d, h, m));

describe("time", () => {
  it("formats local ISO with offset and parses it back", () => {
    const iso = toLocalISO(NOW);
    expect(iso).toMatch(/^2026-10-09T08:30:00[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(NOW.getTime());
  });
  it("parses date-only as all-day and naive times as local", () => {
    expect(parseWhen("2026-10-10")).toEqual({ date: new Date(2026, 9, 10, 9, 0), allDay: true });
    expect(parseWhen("2026-10-10T15:00")?.date.getHours()).toBe(15);
    expect(parseWhen("nonsense")).toBeNull();
  });
  it("labels relative days in Sinhala and English", () => {
    expect(relativeLabel(at(10, 10), false, NOW, "si")).toBe("හෙට 10:00 AM");
    expect(relativeLabel(at(8, 17), false, NOW, "en")).toBe("Yesterday 5:00 PM");
    expect(relativeLabel(at(9, 0), true, NOW, "si")).toBe("අද");
  });
  it("handles quiet hours that wrap midnight", () => {
    expect(inQuietHours(new Date(2026, 9, 9, 23, 0), "22:00", "06:00")).toBe(true);
    expect(inQuietHours(new Date(2026, 9, 9, 12, 0), "22:00", "06:00")).toBe(false);
    expect(afterQuietHours(new Date(2026, 9, 9, 23, 0), "22:00", "06:00")).toEqual(new Date(2026, 9, 10, 6, 0));
    expect(afterQuietHours(new Date(2026, 9, 10, 3, 0), "22:00", "06:00")).toEqual(new Date(2026, 9, 10, 6, 0));
  });
});

describe("recurrence", () => {
  const start = new Date(2026, 9, 5, 9, 0); // Monday 5 Oct, 09:00
  it("daily keeps the time of day", () => {
    expect(nextOccurrence("FREQ=DAILY", start, NOW)).toEqual(new Date(2026, 9, 9, 9, 0));
    expect(nextOccurrence("FREQ=DAILY;INTERVAL=3", start, NOW)).toEqual(new Date(2026, 9, 11, 9, 0));
  });
  it("weekly on given days, with interval", () => {
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO", start, NOW)).toEqual(new Date(2026, 9, 12, 9, 0));
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO,FR", start, NOW)).toEqual(new Date(2026, 9, 9, 9, 0));
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", start, NOW)).toEqual(new Date(2026, 9, 19, 9, 0));
  });
  it("monthly clamps the 31st to the last day", () => {
    const s = new Date(2026, 0, 31, 10, 0);
    expect(nextOccurrence("FREQ=MONTHLY", s, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28, 10, 0));
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=25", start, NOW)).toEqual(new Date(2026, 9, 25, 9, 0));
    expect(nextOccurrence("FREQ=MONTHLY;BYMONTHDAY=-1", start, NOW)).toEqual(new Date(2026, 9, 31, 9, 0));
  });
  it("stops at UNTIL and rejects bad rules", () => {
    expect(nextOccurrence("FREQ=DAILY;UNTIL=20261008", start, NOW)).toBeNull();
    expect(parseRule("FREQ=HOURLY")).toBeNull();
    expect(describeRule("FREQ=WEEKLY;BYDAY=MO", "si")).toBe("හැම සතියෙම · සඳුදා");
  });
});

describe("views and briefing", () => {
  let repo: MemoryRepo;
  beforeEach(async () => {
    repo = new MemoryRepo(() => NOW);
    await repo.createTask({ title: "Invoice", dueAt: at(8, 17) });
    await repo.createTask({ title: "ABC meeting", dueAt: at(9, 10) });
    await repo.createTask({ title: "Bill", dueAt: at(9, 9), allDay: true });
    await repo.createTask({ title: "Shop order", dueAt: at(10, 11) });
    await repo.createTask({ title: "Someday" });
  });
  it("splits overdue, today and upcoming", async () => {
    const tasks = await repo.listTasks();
    expect(overdue(tasks, NOW).map((t) => t.title)).toEqual(["Invoice"]);
    expect(today(tasks, NOW).map((t) => t.title)).toEqual(["Bill", "ABC meeting"]);
    expect(upcoming(tasks, NOW).map((g) => g.tasks.map((t) => t.title))).toEqual([["Shop order"]]);
    // An all-day task is not overdue until the day is over.
    expect(isOverdue(tasks.find((t) => t.title === "Bill")!, new Date(2026, 9, 9, 23, 0))).toBe(false);
  });
  it("builds spoken briefing and review text", async () => {
    const tasks = await repo.listTasks();
    const si = briefingText(tasks, NOW, "si", "Kavinda");
    expect(si).toContain("සුබ උදෑසනක් Kavinda!");
    expect(si).toContain("අද කරන්න 2ක්");
    expect(si).toContain("ඉවර නොකළ 1ක්");
    expect(headline(tasks, NOW, "en")).toBe("2 today · 1 overdue");
    expect(reviewText(tasks, NOW, "en")).toContain("Still open");
  });
  it("builds AI context with short ids", async () => {
    const tasks = await repo.listTasks();
    const ctx = buildContext({ now: NOW, lang: "si", userName: "", areas: [], tasks, actions: [] });
    expect(ctx).toContain(`[${shortId(tasks[0]!.id)}] Invoice`);
    expect(ctx).toContain("Overdue (1):");
    expect(ctx).toContain("Actions: none connected yet.");
  });
});

describe("ops", () => {
  it("completing a repeating task creates the next occurrence from now", async () => {
    const repo = new MemoryRepo(() => NOW);
    const t = await repo.createTask({ title: "Stand-up", dueAt: at(5, 9), rrule: "FREQ=DAILY", remind: [10] });
    const { done, next } = await completeTask(repo, t.id, NOW);
    expect(done.status).toBe("done");
    expect(next?.dueAt).toBe(at(9, 9));
    expect(next?.remind).toEqual([10]);
  });
  it("snoozes from now when overdue and finds tasks by short id", async () => {
    const repo = new MemoryRepo(() => NOW);
    const t = await repo.createTask({ title: "Call", dueAt: at(8, 9) });
    expect((await snoozeTask(repo, t.id, 60, NOW)).dueAt).toBe(at(9, 9, 30));
    expect((await findTask(repo, shortId(t.id)))?.id).toBe(t.id);
  });
});

describe("tools", () => {
  let repo: MemoryRepo;
  const changes: string[] = [];
  const ctx = () => ({ repo, now: NOW, lang: "si" as const, onTaskChange: (t: { title: string }, k: string) => void changes.push(`${k}:${t.title}`) });
  beforeEach(() => {
    repo = new MemoryRepo(() => NOW);
    repo.addArea("Agency", [30]);
    repo.addArea("Finance");
    changes.length = 0;
  });

  it("every tool has a strict-ready object schema", () => {
    for (const t of TOOLS) {
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema.additionalProperties).toBe(false);
      for (const r of t.input_schema.required) expect(Object.keys(t.input_schema.properties)).toContain(r);
    }
  });

  it("create_task resolves the area, its default reminder and the due time", async () => {
    const r = await executeTool("create_task", { title: "ABC meeting", area: "agency", due: "2026-10-10T10:00:00+05:30" }, ctx());
    expect(r.isError).toBeFalsy();
    const t = repo.tasks[0]!;
    expect(t.areaId).toBe(repo.areas[0]!.id);
    expect(t.remind).toEqual([30]);
    expect(new Date(t.dueAt!).toISOString()).toBe("2026-10-10T04:30:00.000Z");
    expect(r.card?.title).toBe("ABC meeting");
    expect(changes).toEqual(["created:ABC meeting"]);
  });

  it("rejects bad dates and repeat rules", async () => {
    expect((await executeTool("create_task", { title: "x", due: "someday" }, ctx())).isError).toBe(true);
    expect((await executeTool("create_task", { title: "x", repeat: "FREQ=SECONDLY" }, ctx())).isError).toBe(true);
  });

  it("complete, snooze and confirmed delete", async () => {
    const t = await repo.createTask({ title: "Invoice", dueAt: at(8, 17) });
    const id = shortId(t.id);
    const done = JSON.parse((await executeTool("complete_task", { task_id: id }, ctx())).content);
    expect(done.ok).toBe(true);
    expect(done.open_left_today).toBe(0);
    const t2 = await repo.createTask({ title: "Bill", dueAt: at(9, 9) });
    expect((await executeTool("delete_task", { task_id: shortId(t2.id), confirmed: false }, ctx())).isError).toBe(true);
    expect((await executeTool("delete_task", { task_id: shortId(t2.id), confirmed: true }, ctx())).isError).toBeFalsy();
    expect((await repo.getTask(t2.id))?.deletedAt).not.toBeNull();
  });

  it("run_action checks confirmation and required params before calling n8n", async () => {
    const calls: Record<string, string>[] = [];
    repo.actions.push({
      id: "a1",
      systemId: "s1",
      systemName: "Agency CRM",
      key: "client_onboarding",
      name: "Client onboarding",
      description: "start onboarding",
      url: "https://n8n.example/webhook/onboarding",
      params: [{ name: "clientName", description: "", required: true }],
      confirm: true,
      enabled: true,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    });
    const c = { ...ctx(), runAction: async (_a: unknown, p: Record<string, string>) => (calls.push(p), { ok: true, say: "Started" }) };
    expect((await executeTool("run_action", { action_key: "client_onboarding", params: { clientName: "Perera" } }, c)).isError).toBe(true);
    expect((await executeTool("run_action", { action_key: "client_onboarding", confirmed: true }, c)).isError).toBe(true);
    const r = await executeTool("run_action", { action_key: "client_onboarding", params: { clientName: "Perera" }, confirmed: true }, c);
    expect(JSON.parse(r.content).say).toBe("Started");
    expect(calls).toEqual([{ clientName: "Perera" }]);
  });
});

describe("integration payloads", () => {
  it("signs bodies exactly like Node's HMAC-SHA256", () => {
    const body = JSON.stringify({ hello: "සිංහල", n: 1 });
    const expected = createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(signBody("s3cret", body)).toBe(`sha256=${expected}`);
    const longKey = "k".repeat(100);
    expect(signBody(longKey, "x")).toBe(`sha256=${createHmac("sha256", longKey).update("x").digest("hex")}`);
  });
  it("reads n8n replies in several shapes", () => {
    expect(readActionReply(200, '{"say":"Hi"}', "en")).toEqual({ ok: true, say: "Hi" });
    expect(readActionReply(200, '[{"message":"Done!"}]', "en")).toEqual({ ok: true, say: "Done!" });
    expect(readActionReply(200, "", "si").say).toBe("හරි, වැඩේ කළා.");
    expect(readActionReply(500, "boom", "en")).toEqual({ ok: false, say: "boom" });
  });
  it("parses inbox items and skips junk", () => {
    const repo = new MemoryRepo(() => NOW);
    const agency = repo.addArea("Agency");
    const items = parseInbox(
      {
        items: [
          { type: "task", id: "lead-1", title: "Call Silva Motors", due: "2026-10-09T15:00:00+05:30", area: "agency" },
          { type: "notify", title: "Hi" },
          { title: "" },
          5,
        ],
      },
      repo.areas,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "task", externalId: "lead-1", task: { title: "Call Silva Motors", areaId: agency.id, source: "inbox" } });
    expect(items[1]).toEqual({ type: "notify", title: "Hi", body: "" });
  });
  it("round-trips a backup without secrets", async () => {
    const repo = new MemoryRepo(() => NOW);
    repo.addArea("Agency");
    await repo.createTask({ title: "A" });
    const system = {
      id: "s",
      name: "CRM",
      icon: "",
      secret: "top",
      eventsUrl: "",
      events: [],
      inboxUrl: "",
      inboxSince: null,
      lastOkAt: null,
      lastError: null,
      sort: 0,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    };
    const b = makeBackup({ areas: repo.areas, tasks: repo.tasks, systems: [system], actions: [], settings: DEFAULT_SETTINGS }, NOW);
    const text = JSON.stringify(b);
    expect(text).not.toContain("top");
    expect(parseBackup(text).tasks[0]!.title).toBe("A");
    expect(() => parseBackup('{"app":"other"}')).toThrow();
  });
});
