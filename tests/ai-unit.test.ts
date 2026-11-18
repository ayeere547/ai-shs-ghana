import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiError, chat, embed, moderate, parseJson } from "@/lib/ai/client";
import { estimateCost } from "@/lib/ai/config";
import { extractCitations, formatSources, questionsPrompt, reportCommentPrompt, tutorSystemPrompt, type Source } from "@/lib/ai/prompts";
import { chunkText } from "@/lib/ai/rag";
import { localSafetyCheck } from "@/lib/ai/safety";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("AI client", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://example.test/v1/");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends chat requests with structured output and reports usage", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json({ model: "m-1", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 30 } }));
    const res = await chat({ model: "m", messages: [{ role: "user", content: "hi" }], jsonSchema: { name: "x", schema: { type: "object" } } }, fetchImpl as unknown as typeof fetch);
    expect(res).toMatchObject({ text: '{"ok":true}', usage: { inputTokens: 120, outputTokens: 30 }, truncated: false });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(init!.body)).response_format).toMatchObject({ type: "json_schema", json_schema: { name: "x", strict: true } });
  });

  it("retries once on rate limits / server errors, but not on client errors", async () => {
    const flaky = vi.fn().mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json({ model: "m", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }));
    await expect(chat({ model: "m", messages: [] }, flaky as unknown as typeof fetch)).resolves.toMatchObject({ text: "ok" });
    expect(flaky).toHaveBeenCalledTimes(2);
    const bad = vi.fn(async () => json({}, 400));
    await expect(chat({ model: "m", messages: [] }, bad as unknown as typeof fetch)).rejects.toThrow(/AI request failed \(400\)/);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("flags truncated answers and refuses to run without a key", async () => {
    const cut = vi.fn(async () => json({ model: "m", choices: [{ message: { content: "partial" }, finish_reason: "length" }] }));
    await expect(chat({ model: "m", messages: [] }, cut as unknown as typeof fetch)).resolves.toMatchObject({ truncated: true });
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(chat({ model: "m", messages: [] }, cut as unknown as typeof fetch)).rejects.toThrow(/not configured/);
  });

  it("orders embeddings and checks their size; reads moderation categories", async () => {
    const e = vi.fn(async () => json({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 7 } }));
    await expect(embed(["a", "b"], "emb", 2, e as unknown as typeof fetch)).resolves.toEqual({ vectors: [[1, 0], [0, 1]], usage: { inputTokens: 7, outputTokens: 0 } });
    await expect(embed(["a"], "emb", 3, e as unknown as typeof fetch)).rejects.toThrow(/doesn't match/);
    const m = vi.fn(async () => json({ results: [{ flagged: true, categories: { "self-harm": true, violence: false } }] }));
    await expect(moderate("x", "mod", m as unknown as typeof fetch)).resolves.toEqual({ flagged: true, categories: ["self-harm"] });
  });

  it("rejects malformed structured output with a readable error", () => {
    expect(() => parseJson("not json")).toThrow(AiError);
  });
});

describe("chunking", () => {
  it("keeps headings with their content and respects the size target", () => {
    const doc = ["# Fractions", "A fraction is part of a whole.", "", "Equivalent fractions have the same value.", "", "## Decimals", "Decimals are fractions with denominators that are powers of ten.", "", "x".repeat(3000) + "."].join("\n\n");
    const chunks = chunkText(doc, { target: 400, max: 1000, overlap: 50 });
    expect(chunks[0]).toMatchObject({ heading: "Fractions" });
    expect(chunks[0].content).toContain("part of a whole");
    expect(chunks.find((c) => c.content.includes("powers of ten"))?.heading).toBe("Decimals");
    expect(chunks.every((c) => c.content.length <= 7900)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("returns nothing for empty text", () => {
    expect(chunkText("  \n\n ")).toEqual([]);
  });
});

describe("prompts and citations", () => {
  const sources: Source[] = [
    { n: 1, title: "Maths notes", heading: "Fractions", content: "A fraction…", official: false, sourceType: "teacher_notes" },
    { n: 2, title: "Curriculum", heading: null, content: "Learners should…", official: true, sourceType: "curriculum" },
  ];

  it("numbers sources and marks official documents", () => {
    const s = formatSources(sources);
    expect(s).toContain("[1] Maths notes — Fractions");
    expect(s).toContain("[2] Curriculum (official curriculum document)");
    expect(formatSources([])).toMatch(/none found/);
  });

  it("extracts only sources the answer actually cited", () => {
    expect(extractCitations("See [2]. Also [9].", sources)).toEqual([{ n: 2, title: "Curriculum", heading: null, official: true }]);
  });

  it("tutor prompt carries the teaching and safety rules", () => {
    const p = tutorSystemPrompt({ subject: "Core Mathematics", formLevel: 2, schoolName: "Sample SHS" });
    expect(p).toMatch(/do not just give the final answer/);
    expect(p).toMatch(/Never present questions you write as official WAEC past questions/);
    expect(p).toMatch(/112/);
  });

  it("report comments are built without student names", () => {
    const p = reportCommentPrompt({ average: 61.5, subjects: [{ subject: "Core Mathematics", total: 58 }], attendanceRate: 92, teacherNotes: null, tone: "encouraging" });
    expect(p).toContain('"the student"');
    expect(p).toContain("Core Mathematics 58%");
    expect(questionsPrompt({ subject: "Physics", topic: "Motion", formLevel: 1, count: 5, types: ["mcq"], difficulty: "easy", marks: 2 })).toMatch(/Never label generated questions as official/);
  });
});

describe("safety", () => {
  it.each([
    ["I want to kill myself", "self_harm"],
    ["sometimes I cut myself", "self_harm"],
    ["my uncle touches me", "abuse"],
    ["how do I solve 2x + 3 = 7", null],
    ["the cell membrane kills bacteria", null],
  ])("%s → %s", (text, concern) => expect(localSafetyCheck(text).concern).toBe(concern));
});

describe("cost estimates", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses configurable per-million prices", () => {
    vi.stubEnv("AI_PRICE_INPUT_PER_M", "1");
    vi.stubEnv("AI_PRICE_OUTPUT_PER_M", "2");
    expect(estimateCost(1_000_000, 500_000)).toBe(2);
    vi.stubEnv("AI_PRICE_EMBEDDING_PER_M", "0.5");
    expect(estimateCost(2_000_000, 0, "embedding")).toBe(1);
  });
});

describe("AI draft conversion", () => {
  it("accepts well-formed generated questions and rejects malformed ones", async () => {
    const { toQuestionRow } = await import("@/lib/ai/format");
    const base = { prompt: "2 + 2?", options: [], correct_option: null, correct_bool: null, accepted_answers: [], marking_guide: "", marks: 2, difficulty: "easy" as const, topic: "Addition" };
    expect(toQuestionRow({ ...base, type: "mcq", options: ["3", "4", "5", "6"], correct_option: 1 }, "s", 1)).toMatchObject({
      type: "mcq", source: "ai_generated", options: [{ id: "a", text: "3" }, { id: "b", text: "4" }, { id: "c", text: "5" }, { id: "d", text: "6" }], answer: { correct: "b" },
    });
    expect(toQuestionRow({ ...base, type: "mcq", options: ["3", "4"], correct_option: 5 }, "s", 1)).toBeNull();
    expect(toQuestionRow({ ...base, type: "true_false", correct_bool: null }, "s", 1)).toBeNull();
    expect(toQuestionRow({ ...base, type: "short_answer", accepted_answers: [" four ", ""] }, "s", null)).toMatchObject({ answer: { accepted: ["four"] } });
    expect(toQuestionRow({ ...base, type: "essay", prompt: " " }, "s", null)).toBeNull();
  });

  it("strips names and ids when pseudonymising class data", async () => {
    const { pseudonymise } = await import("@/lib/ai/format");
    expect(pseudonymise([{ name: "Ama Mensah", student_id: "x", average: 61 }])).toEqual([{ id: "S1", average: 61 }]);
  });

  it("renders lesson plans and notes as readable text", async () => {
    const { lessonPlanToText, notesToText } = await import("@/lib/ai/format");
    const text = lessonPlanToText({ title: "T", objectives: ["Add fractions"], materials: ["Chalk"], introduction: "Intro", activities: [{ step: "Demo", minutes: 10, teacher: "Shows", students: "Watch" }], assessment: ["Quiz"], differentiation: "Pairs", homework: "Ex 1", notes_on_sources: "" });
    expect(text).toContain("1. Demo (10 min)");
    expect(notesToText({ title: "N", summary: "Sum", sections: [{ heading: "Fractions", body: "B" }], key_terms: [], exercises: ["Q1"] })).toContain("FRACTIONS\nB");
  });
});
