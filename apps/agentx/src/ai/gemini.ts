/** Google Gemini REST API: speech-to-text and a function-calling fallback agent. */
import type { ToolDef } from "@/core/tools";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  thoughtSignature?: string;
  thought?: boolean;
}
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}
interface GeminiResponse {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call(model: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<GeminiResponse> {
  const res = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) throw new GeminiError(json.error?.message ?? `Gemini HTTP ${res.status}`, res.status);
  return json;
}

const TRANSCRIBE_PROMPT =
  "Transcribe this voice command exactly as spoken. The speaker uses Sinhala, English or a mix of both. " +
  "Write Sinhala words in Sinhala script and English words (names, brands, tech terms) in English letters. " +
  "Write numbers and times as digits. Output only the transcript, nothing else. If there is no speech, output nothing.";

/** Audio (base64, e.g. m4a from the recorder) → transcript text. */
export async function transcribe(opts: { apiKey: string; model: string; audioBase64: string; mimeType: string; signal?: AbortSignal }): Promise<string> {
  const json = await call(
    opts.model,
    opts.apiKey,
    {
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: opts.mimeType, data: opts.audioBase64 } }, { text: TRANSCRIBE_PROMPT }] }],
      generationConfig: { temperature: 0 },
    },
    opts.signal,
  );
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("")
    .trim();
}

/** Gemini accepts an OpenAPI subset: drop `additionalProperties`, and turn free-form objects into JSON strings. */
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "additionalProperties") continue;
    if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, Record<string, unknown>>).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    } else if (k === "items" && v && typeof v === "object") {
      out.items = toGeminiSchema(v as Record<string, unknown>);
    } else out[k] = v;
  }
  if (out.type === "object" && (!out.properties || Object.keys(out.properties as object).length === 0) && schema !== undefined) {
    // A top-level tool with no inputs keeps `type: object`; free-form nested objects become a JSON string.
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      return { type: "string", description: `${String(schema.description ?? "")} JSON object as a string.`.trim() };
    }
  }
  return out;
}

export function geminiTools(tools: ToolDef[]) {
  return [
    {
      functionDeclarations: tools.map((t) => {
        const params = toGeminiSchema(t.input_schema as unknown as Record<string, unknown>);
        return Object.keys((params.properties as object) ?? {}).length
          ? { name: t.name, description: t.description, parameters: params }
          : { name: t.name, description: t.description };
      }),
    },
  ];
}

/** One model turn. Returns the model content (kept verbatim in history, including thought signatures). */
export async function geminiTurn(opts: {
  apiKey: string;
  model: string;
  system: string;
  tools: ToolDef[];
  contents: GeminiContent[];
  signal?: AbortSignal;
}): Promise<{ content: GeminiContent; blocked: boolean }> {
  const json = await call(
    opts.model,
    opts.apiKey,
    {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.contents,
      tools: geminiTools(opts.tools),
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.3 },
    },
    opts.signal,
  );
  const cand = json.candidates?.[0];
  const blocked = !!json.promptFeedback?.blockReason || cand?.finishReason === "SAFETY";
  return { content: cand?.content ?? { role: "model", parts: [] }, blocked };
}
