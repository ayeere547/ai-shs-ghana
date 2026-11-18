/**
 * AI configuration — every model and price is configurable, so models can change without code changes.
 * Works with OpenAI or any OpenAI-compatible endpoint (set OPENAI_BASE_URL).
 * Prices are USD per million tokens and only feed the cost estimates in the usage reports.
 */
const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

export function aiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    models: {
      tutor: process.env.AI_MODEL_TUTOR ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      teacher: process.env.AI_MODEL_TEACHER ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      embedding: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      moderation: process.env.AI_MODERATION_MODEL ?? "omni-moderation-latest",
    },
    embeddingDimensions: 1536, // must match knowledge_chunks.embedding
    prices: {
      input: num(process.env.AI_PRICE_INPUT_PER_M, 0.15),
      output: num(process.env.AI_PRICE_OUTPUT_PER_M, 0.6),
      embedding: num(process.env.AI_PRICE_EMBEDDING_PER_M, 0.02),
    },
    moderationEnabled: process.env.AI_MODERATION !== "off",
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 60_000),
  };
}

export const isAiConfigured = () => Boolean(aiConfig().apiKey);

export function estimateCost(inputTokens: number, outputTokens: number, kind: "chat" | "embedding" = "chat") {
  const { prices } = aiConfig();
  const usd = kind === "embedding" ? (inputTokens / 1e6) * prices.embedding : (inputTokens / 1e6) * prices.input + (outputTokens / 1e6) * prices.output;
  return Math.round(usd * 1e6) / 1e6;
}
