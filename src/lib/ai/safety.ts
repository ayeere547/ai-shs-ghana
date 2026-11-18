/**
 * Student-safety checks that run before anything reaches the model. Provider moderation adds
 * to these; neither is relied on alone. A concern flags the message for the school's
 * safeguarding staff — it never blocks a student from getting a caring reply.
 */
const SELF_HARM = /\b(kill\s+my\s*self|suicid\w*|end\s+my\s+life|want\s+to\s+die|hurt(ing)?\s+my\s*self|self[-\s]?harm|cut(ting)?\s+my\s*self)\b/i;
const ABUSE = /\b(he|she|they|my\s+\w+)\s+(touch(es|ed)?|beat(s)?|abus\w+|rap\w+)\s+me\b|\b(being|been|was)\s+(abused|raped|beaten)\b/i;

export type SafetyResult = { concern: "self_harm" | "abuse" | "moderation" | null; categories: string[] };

export function localSafetyCheck(text: string): SafetyResult {
  if (SELF_HARM.test(text)) return { concern: "self_harm", categories: ["self-harm"] };
  if (ABUSE.test(text)) return { concern: "abuse", categories: ["abuse"] };
  return { concern: null, categories: [] };
}

/** Fixed, caring reply used when a safety concern is detected (the model is not asked to improvise). */
export const SAFETY_REPLY =
  "I'm really glad you told me, and I'm sorry you're going through this. You don't have to handle it alone. Please talk to your school counsellor, a teacher you trust, or another trusted adult as soon as you can — today if possible. If you are in danger right now, call 112. I'm here to help with your studies whenever you're ready.";

export const BLOCKED_REPLY = "I can't help with that. Let's keep our chat about your learning — what topic are you working on?";

/** Inline image limits for tutor questions (images are sent to the model, never stored). */
export const TUTOR_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const TUTOR_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
