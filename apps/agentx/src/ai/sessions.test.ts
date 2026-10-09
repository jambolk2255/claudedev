import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/core/memory-repo";
import { DEFAULT_SETTINGS } from "@/core/types";
import { ClaudeSession, GeminiSession } from "./sessions";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const message = (content: Json[], stop_reason: string) => ({
  id: `msg_${Math.random().toString(36).slice(2)}`,
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

/** Fake Messages API: records requests and answers with scripted responses. */
function fakeClaude(script: ((body: Json) => Json)[]) {
  const requests: { headers: Headers; body: Json }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Json;
    requests.push({ headers: new Headers(init.headers), body });
    const next = script[requests.length - 1];
    if (!next) throw new Error("unexpected request");
    return new Response(JSON.stringify(next(body)), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { requests, fetchImpl };
}

const lastUser = (body: Json) => body.messages[body.messages.length - 1] as Json;

function setup() {
  const repo = new MemoryRepo(() => new Date(2026, 9, 9, 8, 30));
  repo.addArea("Agency", [30]);
  const ctx = { repo, lang: "si" as const, settings: { ...DEFAULT_SETTINGS }, userName: "" };
  return { repo, ctx };
}

describe("ClaudeSession", () => {
  it("runs tools, pauses on ask_user, resumes with the answer and replies", async () => {
    const { repo, ctx } = setup();
    let createdId = "";
    const { requests, fetchImpl } = fakeClaude([
      () =>
        message(
          [
            { type: "tool_use", id: "tu_1", name: "create_task", input: { title: "ABC meeting", area: "Agency", due: "2026-10-10T10:00:00+05:30" } },
            { type: "tool_use", id: "tu_2", name: "ask_user", input: { question: "කීයට මතක් කරන්නද?", options: ["පැයකට කලින්", "එපා"] } },
          ],
          "tool_use",
        ),
      (body) => {
        const results = lastUser(body).content as Json[];
        const created = JSON.parse(results.find((r) => r.tool_use_id === "tu_1")!.content);
        createdId = created.task.id;
        return message([{ type: "tool_use", id: "tu_3", name: "update_task", input: { task_id: createdId, remind_minutes: [60] } }], "tool_use");
      },
      () => message([{ type: "text", text: "හරි, හෙට 9ට මතක් කරනවා." }], "end_turn"),
    ]);
    const session = new ClaudeSession("sk-test", ctx, fetchImpl);

    const first = await session.send("හෙට උදේ 10ට ABC meeting එකක්");
    expect(first.ask).toEqual({ question: "කීයට මතක් කරන්නද?", options: ["පැයකට කලින්", "එපා"] });
    expect(first.cards.map((c) => c.title)).toEqual(["ABC meeting"]);
    expect(repo.tasks).toHaveLength(1);

    // Request shape: cached system prompt, tools, low effort, server-side fallback, context block first.
    const req = requests[0]!;
    expect(req.headers.get("x-api-key")).toBe("sk-test");
    expect(req.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.fallbacks).toBe("default");
    expect(req.body.output_config).toEqual({ effort: "low" });
    expect(req.body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.body.tools.map((t: Json) => t.name)).toContain("ask_user");
    expect(req.body.messages[0].content[0].text).toContain("<context>");

    const second = await session.send("පැයකට කලින්");
    expect(second.reply).toBe("හරි, හෙට 9ට මතක් කරනවා.");
    expect(second.ask).toBeNull();
    // Both tool results (create + the ask_user answer) go back in one user message.
    const resumed = lastUser(requests[1]!.body).content as Json[];
    expect(resumed.map((r) => r.tool_use_id)).toEqual(["tu_1", "tu_2"]);
    expect(resumed[1]!.content).toBe("පැයකට කලින්");
    expect(repo.tasks[0]!.remind).toEqual([60]);
    // History is append-only: the third request starts with the exact first two messages.
    expect(requests[2]!.body.messages.slice(0, 2)).toEqual(requests[1]!.body.messages.slice(0, 2));
  });

  it("does not send fallbacks for Haiku and handles refusals", async () => {
    const { ctx } = setup();
    ctx.settings.claudeModel = "claude-haiku-5-5";
    const { requests, fetchImpl } = fakeClaude([() => message([], "refusal")]);
    const res = await new ClaudeSession("sk-test", ctx, fetchImpl).send("hi");
    expect(res.reply).toBe("සමාවෙන්න, ඒක කරන්න බෑ.");
    expect(requests[0]!.body.fallbacks).toBeUndefined();
  });
});

describe("GeminiSession", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("executes function calls and returns the final text", async () => {
    const { repo, ctx } = setup();
    const bodies: Json[] = [];
    const responses = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "create_task", args: { title: "Gym", due: "2026-10-09T19:00" } } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "හරි, රෑ 7ට Gym දැම්මා." }] } }] },
    ];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(responses[bodies.length - 1]), { status: 200 });
    });
    const res = await new GeminiSession("AIza-test", ctx).send("අද රෑ 7ට gym");
    expect(res.reply).toBe("හරි, රෑ 7ට Gym දැම්මා.");
    expect(repo.tasks[0]!.title).toBe("Gym");
    const fnResponse = bodies[1]!.contents.at(-1).parts[0].functionResponse;
    expect(fnResponse.name).toBe("create_task");
    expect(fnResponse.response.ok).toBe(true);
    // Gemini's schema subset has no additionalProperties.
    expect(JSON.stringify(bodies[0]!.tools)).not.toContain("additionalProperties");
  });
});
