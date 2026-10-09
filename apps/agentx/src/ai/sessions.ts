/**
 * Conversation sessions. Each user utterance runs a tool-use loop against Claude (or Gemini when only a
 * Gemini key is set). History is append-only so cached prefixes and thinking blocks stay valid.
 * No React Native imports here, so the loop is unit-tested in Node.
 */
import Anthropic from "@anthropic-ai/sdk";
import { buildContext, SYSTEM_PROMPT } from "@/core/prompt";
import { executeTool, TOOLS, type ToolCard, type ToolContext } from "@/core/tools";
import type { Settings } from "@/core/types";
import { geminiTurn, type GeminiContent, type GeminiPart } from "./gemini";

export interface TurnResult {
  reply: string;
  cards: ToolCard[];
  /** Set when the assistant is waiting for an answer (the mic re-opens). */
  ask: { question: string; options: string[] } | null;
  tools: string[];
}

const MAX_STEPS = 8;
export type SessionContext = Omit<ToolContext, "now"> & { settings: Settings };
type Ctx = SessionContext;

async function contextText(ctx: Ctx, now: Date): Promise<string> {
  const [areas, tasks, actions] = await Promise.all([ctx.repo.listAreas(), ctx.repo.listTasks({ includeDone: false }), ctx.repo.listActions()]);
  return buildContext({ now, lang: ctx.lang, userName: ctx.settings.userName, areas, tasks, actions });
}

function askFrom(input: Record<string, unknown>) {
  return {
    question: String(input.question ?? ""),
    options: Array.isArray(input.options) ? input.options.map(String).slice(0, 4) : [],
  };
}

const refusalText = (lang: "si" | "en") => (lang === "si" ? "සමාවෙන්න, ඒක කරන්න බෑ." : "Sorry, I can't help with that.");

/* ------------------------------------------------------------------ Claude */

export class ClaudeSession {
  private client: Anthropic;
  private messages: Anthropic.Beta.BetaMessageParam[] = [];
  /** Tool results already computed for the turn that is waiting on ask_user. */
  private pending: { results: Anthropic.Beta.BetaToolResultBlockParam[]; askId: string } | null = null;

  constructor(
    apiKey: string,
    private ctx: Ctx,
    fetchImpl?: typeof fetch,
  ) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 60_000, fetch: fetchImpl });
  }

  async send(text: string, signal?: AbortSignal): Promise<TurnResult> {
    const now = new Date();
    if (this.pending) {
      const { results, askId } = this.pending;
      this.pending = null;
      this.messages.push({ role: "user", content: [...results, { type: "tool_result", tool_use_id: askId, content: text }] });
    } else {
      const context = await contextText(this.ctx, now);
      this.messages.push({
        role: "user",
        content: [
          { type: "text", text: `<context>\n${context}\n</context>` },
          { type: "text", text },
        ],
      });
    }

    const cards: ToolCard[] = [];
    const used: string[] = [];
    const model = this.ctx.settings.claudeModel;
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await this.client.beta.messages.create(
        {
          model,
          max_tokens: 4096,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          messages: this.messages,
          output_config: { effort: "low" },
          // Re-run a safety-declined request on Anthropic's recommended fallback model (not offered for Haiku).
          ...(model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        },
        { signal },
      );
      this.messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") return { reply: refusalText(this.ctx.lang), cards, ask: null, tools: used };
      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (!toolUses.length) return { reply: text, cards, ask: null, tools: used };

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      let ask: { id: string; question: string; options: string[] } | null = null;
      for (const tu of toolUses) {
        used.push(tu.name);
        const input = (tu.input ?? {}) as Record<string, unknown>;
        if (tu.name === "ask_user") {
          ask = { id: tu.id, ...askFrom(input) };
          continue;
        }
        const r = await executeTool(tu.name, input, { ...this.ctx, now: new Date() });
        if (r.card) cards.push(r.card);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError });
      }
      if (ask) {
        this.pending = { results, askId: ask.id };
        return { reply: [text, ask.question].filter(Boolean).join(" "), cards, ask: { question: ask.question, options: ask.options }, tools: used };
      }
      this.messages.push({ role: "user", content: results });
    }
    return { reply: this.ctx.lang === "si" ? "සමාවෙන්න, ආයේ කියන්න පුළුවන්ද?" : "Sorry, could you say that again?", cards, ask: null, tools: used };
  }
}

/* ------------------------------------------------------------------ Gemini */

export class GeminiSession {
  private contents: GeminiContent[] = [];
  private pending: { parts: GeminiPart[]; askName: string; askId?: string } | null = null;

  constructor(
    private apiKey: string,
    private ctx: Ctx,
  ) {}

  async send(text: string, signal?: AbortSignal): Promise<TurnResult> {
    const now = new Date();
    if (this.pending) {
      const { parts, askName, askId } = this.pending;
      this.pending = null;
      this.contents.push({ role: "user", parts: [...parts, { functionResponse: { name: askName, id: askId, response: { answer: text } } }] });
    } else {
      this.contents.push({ role: "user", parts: [{ text: `<context>\n${await contextText(this.ctx, now)}\n</context>` }, { text }] });
    }

    const cards: ToolCard[] = [];
    const used: string[] = [];
    for (let step = 0; step < MAX_STEPS; step++) {
      const { content, blocked } = await geminiTurn({
        apiKey: this.apiKey,
        model: this.ctx.settings.geminiModel,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        contents: this.contents,
        signal,
      });
      if (blocked) return { reply: refusalText(this.ctx.lang), cards, ask: null, tools: used };
      this.contents.push({ role: "model", parts: content.parts });
      const calls = content.parts.filter((p) => p.functionCall);
      const reply = content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join(" ")
        .trim();
      if (!calls.length) return { reply, cards, ask: null, tools: used };

      const parts: GeminiPart[] = [];
      let ask: { name: string; id?: string; question: string; options: string[] } | null = null;
      for (const p of calls) {
        const call = p.functionCall!;
        used.push(call.name);
        const args = { ...(call.args ?? {}) };
        if (call.name === "ask_user") {
          ask = { name: call.name, id: call.id, ...askFrom(args) };
          continue;
        }
        if (call.name === "run_action" && typeof args.params === "string") {
          try {
            args.params = JSON.parse(args.params);
          } catch {
            args.params = {};
          }
        }
        const r = await executeTool(call.name, args, { ...this.ctx, now: new Date() });
        if (r.card) cards.push(r.card);
        parts.push({ functionResponse: { name: call.name, id: call.id, response: JSON.parse(r.content) as Record<string, unknown> } });
      }
      if (ask) {
        this.pending = { parts, askName: ask.name, askId: ask.id };
        return { reply: [reply, ask.question].filter(Boolean).join(" "), cards, ask: { question: ask.question, options: ask.options }, tools: used };
      }
      this.contents.push({ role: "user", parts });
    }
    return { reply: this.ctx.lang === "si" ? "සමාවෙන්න, ආයේ කියන්න පුළුවන්ද?" : "Sorry, could you say that again?", cards, ask: null, tools: used };
  }
}
