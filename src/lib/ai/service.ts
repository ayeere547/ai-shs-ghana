import "server-only";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { AiError, chat, embed, parseJson, type ChatMessage } from "./client";
import { aiConfig, estimateCost, isAiConfigured } from "./config";
import { formatSources, type Source } from "./prompts";

/**
 * Central AI service. Every feature goes through here so quota checks, retrieval, usage/cost
 * logging and error handling are applied consistently. Components never call the model directly.
 */
export type Feature = "tutor" | "lesson_plan" | "notes" | "questions" | "marking" | "report_comment" | "insights";
export type Quota = { tutor_enabled: boolean; teacher_tools_enabled: boolean; limit: number | null; used: number; student_daily_limit: number; my_tutor_messages_today: number };

export type AiAccess = { ok: true; quota: Quota } | { ok: false; reason: string; quota?: Quota };

export async function aiAccess(schoolId: string, kind: "tutor" | "teacher"): Promise<AiAccess> {
  if (!isAiConfigured()) return { ok: false, reason: "AI features aren't configured on this server yet (OPENAI_API_KEY)." };
  if (!serverEnv().serviceRoleKey) return { ok: false, reason: "AI features need SUPABASE_SERVICE_ROLE_KEY on the server." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ai_quota", { p_school: schoolId });
  if (error || !data) return { ok: false, reason: "Couldn't check your school's AI allowance." };
  const quota = data as Quota;
  if (kind === "tutor" && !quota.tutor_enabled) return { ok: false, reason: "Your school has turned the AI tutor off.", quota };
  if (kind === "teacher" && !quota.teacher_tools_enabled) return { ok: false, reason: "Your school has turned AI teaching tools off.", quota };
  if (quota.limit !== null && quota.used >= quota.limit) {
    return { ok: false, reason: quota.limit === 0 ? "Your school's plan doesn't include AI features yet. Ask your administrator." : "Your school has used this month's AI allowance.", quota };
  }
  if (kind === "tutor" && quota.my_tutor_messages_today >= quota.student_daily_limit) {
    return { ok: false, reason: `You've reached today's limit of ${quota.student_daily_limit} tutor messages. Try again tomorrow.`, quota };
  }
  return { ok: true, quota };
}

/** Usage is written with the service role so users can't forge or delete it. */
export async function logUsage(row: { schoolId: string; userId: string; feature: Feature | "embedding" | "moderation"; model: string; promptVersion?: string; inputTokens?: number; outputTokens?: number; status?: "ok" | "error" | "blocked"; kind?: "chat" | "embedding" }) {
  try {
    await createAdminClient().from("ai_usage_logs").insert({
      school_id: row.schoolId,
      user_id: row.userId,
      feature: row.feature,
      model: row.model,
      prompt_version: row.promptVersion ?? null,
      input_tokens: row.inputTokens ?? 0,
      output_tokens: row.outputTokens ?? 0,
      cost_usd: estimateCost(row.inputTokens ?? 0, row.outputTokens ?? 0, row.kind ?? "chat"),
      status: row.status ?? "ok",
    });
  } catch {
    // Usage logging must never break the user's request.
  }
}

/** Retrieves relevant knowledge (vector search when possible, keyword search otherwise) under the user's RLS. */
export async function retrieve(ctx: { schoolId: string; userId: string }, query: string, subject: string | null, limit = 5): Promise<Source[]> {
  const supabase = await createClient();
  let embedding: number[] | null = null;
  const cfg = aiConfig();
  if (isAiConfigured()) {
    try {
      const res = await embed([query.slice(0, 2000)], cfg.models.embedding, cfg.embeddingDimensions);
      embedding = res.vectors[0] ?? null;
      await logUsage({ ...ctx, feature: "embedding", model: cfg.models.embedding, inputTokens: res.usage.inputTokens, kind: "embedding" });
    } catch {
      embedding = null; // fall back to keyword search
    }
  }
  const run = (vec: number[] | null) =>
    supabase.rpc("match_knowledge", { p_school: ctx.schoolId, p_embedding: vec ? `[${vec.join(",")}]` : null, p_query: query.slice(0, 500), p_subject: subject, p_limit: limit });
  let { data } = await run(embedding);
  if (embedding && !(data ?? []).length) ({ data } = await run(null)); // documents not embedded yet
  type Row = { title: string; heading: string | null; content: string; is_official: boolean; source_type: string; score: number };
  return ((data ?? []) as Row[])
    .filter((r) => !embedding || r.score > 0.2)
    .map((r, i) => ({ n: i + 1, title: r.title, heading: r.heading, content: r.content.slice(0, 1800), official: r.is_official, sourceType: r.source_type }));
}

/** Runs a structured (JSON-schema) generation for a teacher tool, grounded in retrieved sources. */
export async function generateStructured<T>(opts: {
  ctx: { schoolId: string; userId: string };
  feature: Feature;
  promptVersion: string;
  prompt: string;
  schema: { name: string; schema: Record<string, unknown> };
  sources?: Source[];
  maxTokens?: number;
}): Promise<{ data: T; sources: Source[] }> {
  const cfg = aiConfig();
  const model = cfg.models.teacher;
  const messages: ChatMessage[] = [
    { role: "system", content: opts.prompt },
    { role: "user", content: formatSources(opts.sources ?? []) },
  ];
  try {
    const res = await chat({ model, messages, maxTokens: opts.maxTokens ?? 2500, temperature: 0.5, jsonSchema: opts.schema });
    await logUsage({ ...opts.ctx, feature: opts.feature, model: res.model, promptVersion: opts.promptVersion, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens });
    if (res.truncated) throw new AiError("The response was too long and got cut off. Try asking for less.");
    return { data: parseJson<T>(res.text), sources: opts.sources ?? [] };
  } catch (error) {
    if (!(error instanceof AiError && error.status === undefined && /cut off|expected format/.test(error.message))) {
      await logUsage({ ...opts.ctx, feature: opts.feature, model, promptVersion: opts.promptVersion, status: "error" });
    }
    throw error;
  }
}

export const aiErrorMessage = (error: unknown) => (error instanceof AiError ? error.message : "The AI assistant couldn't complete that. Please try again.");
