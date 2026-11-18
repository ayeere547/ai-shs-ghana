/**
 * Delivery channels. Pure request builders + thin senders with injectable fetch (unit-tested).
 * Email: Resend. SMS: Arkesel or Hubtel (common Ghanaian gateways) or "log" for development.
 */
type FetchLike = typeof fetch;

export type Category = "announcements" | "results" | "payments" | "attendance" | "coursework" | "messages" | "safeguarding" | "account";
export type Preferences = { email_enabled: boolean; sms_enabled: boolean; sms_phone: string | null; categories: Partial<Record<Category, boolean>> };

export const DEFAULT_PREFERENCES: Preferences = { email_enabled: true, sms_enabled: false, sms_phone: null, categories: {} };

/** Safety and account notices always go out; other categories follow the user's choices (default on). */
export function shouldDeliver(prefs: Preferences, category: Category, channel: "email" | "sms") {
  if (channel === "email" && !prefs.email_enabled) return false;
  if (channel === "sms" && (!prefs.sms_enabled || !prefs.sms_phone)) return false;
  if (category === "safeguarding" || category === "account") return true;
  return prefs.categories[category] !== false;
}

/** Normalises Ghanaian numbers (024…, 233…, +233…) to +233XXXXXXXXX, or null. */
export function normaliseGhanaPhone(input: string | null | undefined) {
  const digits = (input ?? "").replace(/[^\d+]/g, "");
  const m = /^(?:\+?233|0)([235]\d{8})$/.exec(digits);
  return m ? `+233${m[1]}` : null;
}

/** SMS text: title + body, plain ASCII-friendly, capped to two segments. */
export function smsText(title: string, body: string, link?: string | null, siteUrl?: string) {
  const text = `${title}: ${body}`.replace(/\s+/g, " ").trim();
  const withLink = link && siteUrl ? `${text} ${siteUrl}${link}` : text;
  return withLink.length > 300 ? `${withLink.slice(0, 297)}...` : withLink;
}

export function smsConfig() {
  return {
    provider: (process.env.SMS_PROVIDER ?? "") as "arkesel" | "hubtel" | "log" | "",
    apiKey: process.env.SMS_API_KEY ?? "",
    apiSecret: process.env.SMS_API_SECRET ?? "",
    sender: (process.env.SMS_SENDER_ID ?? "AISHSGH").slice(0, 11),
  };
}
export const isSmsConfigured = () => {
  const c = smsConfig();
  return c.provider === "log" || (Boolean(c.provider) && Boolean(c.apiKey));
};
export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendSms(to: string, message: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const c = smsConfig();
  if (c.provider === "log") {
    console.info(`[sms:log] to=${to.slice(0, 7)}… ${message.slice(0, 60)}`);
    return;
  }
  let res: Response;
  if (c.provider === "arkesel") {
    res = await fetchImpl("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": c.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: c.sender, message, recipients: [to.replace(/^\+/, "")] }),
    });
  } else if (c.provider === "hubtel") {
    res = await fetchImpl("https://smsc.hubtel.com/v1/messages/send", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ From: c.sender, To: to, Content: message }),
    });
  } else {
    throw new Error("SMS is not configured");
  }
  if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
}

export async function sendEmail(to: string, subject: string, text: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Email is not configured");
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: subject.slice(0, 200), text }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}
