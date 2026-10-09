import Anthropic from "@anthropic-ai/sdk";
import { getKey } from "./keys";
import { ClaudeSession, GeminiSession, type SessionContext, type TurnResult } from "./sessions";

export type { TurnResult } from "./sessions";

export class MissingKeyError extends Error {}

export interface AgentSession {
  provider: "claude" | "gemini";
  send(text: string, signal?: AbortSignal): Promise<TurnResult>;
}

/** Claude when a Claude key is set, otherwise Gemini. Throws MissingKeyError when neither is set. */
export async function createSession(ctx: SessionContext): Promise<AgentSession> {
  const claude = await getKey("claude");
  if (claude) {
    const s = new ClaudeSession(claude, ctx);
    return { provider: "claude", send: (t, sig) => s.send(t, sig) };
  }
  const gemini = await getKey("gemini");
  if (gemini) {
    const s = new GeminiSession(gemini, ctx);
    return { provider: "gemini", send: (t, sig) => s.send(t, sig) };
  }
  throw new MissingKeyError("No AI key");
}

/** Readable message for errors shown in the voice screen. */
export function describeError(e: unknown, lang: "si" | "en"): string {
  const si = lang === "si";
  if (e instanceof MissingKeyError)
    return si ? "AI key එකක් නෑ. තව → AI API keys එකට Claude හෝ Gemini key එක දාන්න." : "No AI key. Add a Claude or Gemini key in More → AI API keys.";
  if (e instanceof Anthropic.AuthenticationError)
    return si ? "Claude key එක වැරදියි. Settings එකේ check කරන්න." : "The Claude key is invalid. Check it in Settings.";
  if (e instanceof Anthropic.RateLimitError) return si ? "Claude limit එකට ආවා. ටිකකින් ආයේ try කරන්න." : "Claude rate limit reached. Try again shortly.";
  if (e instanceof Anthropic.APIConnectionError) return si ? "Internet connection එක check කරන්න." : "Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Claude error ${e.status ?? ""}: ${e.message}`;
  if (e instanceof Error && e.name === "AbortError") return si ? "නැවැත්තුවා." : "Stopped.";
  return e instanceof Error ? e.message : String(e);
}
