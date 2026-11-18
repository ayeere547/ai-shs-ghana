import { aiConfig } from "./config";

/**
 * Minimal OpenAI-compatible client (no SDK): chat completions (incl. images and JSON-schema
 * structured output), embeddings and moderation. `fetchImpl` is injectable for tests.
 */
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "auto" } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };
export type Usage = { inputTokens: number; outputTokens: number };

export class AiError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
  }
}

type FetchLike = typeof fetch;

async function call<T>(path: string, body: unknown, fetchImpl: FetchLike = fetch): Promise<T> {
  const cfg = aiConfig();
  if (!cfg.apiKey) throw new AiError("AI is not configured on this server.");
  let lastError: AiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const res = await fetchImpl(`${cfg.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new AiError(res.status === 429 ? "The AI service is busy. Please try again in a moment." : `AI request failed (${res.status}).`, res.status, retryable);
      if (!retryable) throw lastError;
    } catch (error) {
      if (error instanceof AiError && !error.retryable) throw error;
      lastError = error instanceof AiError ? error : new AiError((error as Error).name === "AbortError" ? "The AI service took too long to respond." : "Couldn't reach the AI service.", undefined, true);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw lastError ?? new AiError("AI request failed.");
}

type ChatResponse = { choices: { message: { content: string | null }; finish_reason: string }[]; usage?: { prompt_tokens: number; completion_tokens: number }; model: string };

export async function chat(
  opts: { model: string; messages: ChatMessage[]; maxTokens?: number; temperature?: number; jsonSchema?: { name: string; schema: Record<string, unknown> } },
  fetchImpl?: FetchLike,
): Promise<{ text: string; usage: Usage; model: string; truncated: boolean }> {
  const body: Record<string, unknown> = { model: opts.model, messages: opts.messages, max_tokens: opts.maxTokens ?? 1200, temperature: opts.temperature ?? 0.4 };
  if (opts.jsonSchema) body.response_format = { type: "json_schema", json_schema: { name: opts.jsonSchema.name, schema: opts.jsonSchema.schema, strict: true } };
  const res = await call<ChatResponse>("/chat/completions", body, fetchImpl);
  const choice = res.choices?.[0];
  if (!choice) throw new AiError("The AI service returned no answer.");
  return {
    text: choice.message.content ?? "",
    usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
    model: res.model ?? opts.model,
    truncated: choice.finish_reason === "length",
  };
}

/** Parses a structured response, failing clearly if the model ignored the schema. */
export function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("The AI response wasn't in the expected format. Please try again.");
  }
}

export async function embed(texts: string[], model: string, dimensions: number, fetchImpl?: FetchLike): Promise<{ vectors: number[][]; usage: Usage }> {
  if (!texts.length) return { vectors: [], usage: { inputTokens: 0, outputTokens: 0 } };
  const res = await call<{ data: { index: number; embedding: number[] }[]; usage?: { prompt_tokens: number } }>("/embeddings", { model, input: texts, dimensions }, fetchImpl);
  const vectors = res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (vectors.some((v) => v.length !== dimensions)) throw new AiError("Embedding size doesn't match the knowledge base.");
  return { vectors, usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: 0 } };
}

export type ModerationResult = { flagged: boolean; categories: string[] };

export async function moderate(input: string, model: string, fetchImpl?: FetchLike): Promise<ModerationResult> {
  const res = await call<{ results: { flagged: boolean; categories: Record<string, boolean> }[] }>("/moderations", { model, input }, fetchImpl);
  const r = res.results?.[0];
  return { flagged: Boolean(r?.flagged), categories: Object.entries(r?.categories ?? {}).filter(([, v]) => v).map(([k]) => k) };
}
