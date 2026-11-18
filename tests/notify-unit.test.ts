import { afterEach, describe, expect, it, vi } from "vitest";

import { normaliseGhanaPhone, sendEmail, sendSms, shouldDeliver, smsText, DEFAULT_PREFERENCES } from "@/lib/notify/channels";

describe("notification routing", () => {
  it("follows channel switches and category choices, but always sends safety notices", () => {
    const prefs = { email_enabled: true, sms_enabled: true, sms_phone: "+233241234567", categories: { announcements: false } };
    expect(shouldDeliver(prefs, "announcements", "email")).toBe(false);
    expect(shouldDeliver(prefs, "results", "sms")).toBe(true);
    expect(shouldDeliver(prefs, "safeguarding", "email")).toBe(true);
    expect(shouldDeliver({ ...prefs, sms_phone: null }, "results", "sms")).toBe(false);
    expect(shouldDeliver({ ...prefs, email_enabled: false }, "safeguarding", "email")).toBe(false);
    expect(shouldDeliver(DEFAULT_PREFERENCES, "payments", "sms")).toBe(false);
  });

  it.each([
    ["0241234567", "+233241234567"],
    ["024 123 4567", "+233241234567"],
    ["233501234567", "+233501234567"],
    ["+233 20 123 4567", "+233201234567"],
    ["12345", null],
    ["0441234567", null],
  ])("normalises %s", (input, out) => expect(normaliseGhanaPhone(input)).toBe(out));

  it("keeps SMS short and appends the link", () => {
    expect(smsText("Results", "Term 1 results are out.", "/parent", "https://x.gh")).toBe("Results: Term 1 results are out. https://x.gh/parent");
    expect(smsText("T", "x".repeat(500)).length).toBe(300);
  });
});

describe("providers", () => {
  afterEach(() => vi.unstubAllEnvs());
  const ok = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response("{}", { status: 200 }));

  it("calls Arkesel with the API key header and local-format recipient", async () => {
    vi.stubEnv("SMS_PROVIDER", "arkesel");
    vi.stubEnv("SMS_API_KEY", "k");
    vi.stubEnv("SMS_SENDER_ID", "MYSCHOOLSENDER");
    await sendSms("+233241234567", "hi", ok as unknown as typeof fetch);
    const [url, init] = ok.mock.calls.at(-1)!;
    expect(url).toBe("https://sms.arkesel.com/api/v2/sms/send");
    expect((init!.headers as Record<string, string>)["api-key"]).toBe("k");
    expect(JSON.parse(String(init!.body))).toEqual({ sender: "MYSCHOOLSEN", message: "hi", recipients: ["233241234567"] });
  });

  it("calls Hubtel with basic auth", async () => {
    vi.stubEnv("SMS_PROVIDER", "hubtel");
    vi.stubEnv("SMS_API_KEY", "id");
    vi.stubEnv("SMS_API_SECRET", "secret");
    await sendSms("+233241234567", "hi", ok as unknown as typeof fetch);
    const [, init] = ok.mock.calls.at(-1)!;
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
  });

  it("raises on provider errors and when unconfigured", async () => {
    vi.stubEnv("SMS_PROVIDER", "arkesel");
    vi.stubEnv("SMS_API_KEY", "k");
    await expect(sendSms("+233241234567", "hi", (async () => new Response("", { status: 401 })) as unknown as typeof fetch)).rejects.toThrow(/401/);
    vi.stubEnv("SMS_PROVIDER", "");
    await expect(sendSms("+233241234567", "hi", ok as unknown as typeof fetch)).rejects.toThrow(/not configured/);
    await expect(sendEmail("a@b.c", "s", "t", ok as unknown as typeof fetch)).rejects.toThrow(/not configured/);
  });
});

describe("Paystack", () => {
  it("verifies webhook signatures in constant time and rejects tampering", async () => {
    const { createHmac } = await import("node:crypto");
    const { verifySignature } = await import("@/lib/payments/paystack");
    const body = JSON.stringify({ event: "charge.success", data: { reference: "r1" } });
    const sig = createHmac("sha512", "sk_test_x").update(body).digest("hex");
    expect(verifySignature(body, sig, "sk_test_x")).toBe(true);
    expect(verifySignature(body.replace("r1", "r2"), sig, "sk_test_x")).toBe(false);
    expect(verifySignature(body, sig, "sk_test_other")).toBe(false);
    expect(verifySignature(body, null, "sk_test_x")).toBe(false);
  });

  it("converts cedis to pesewas exactly", async () => {
    const { toPesewas, fromPesewas } = await import("@/lib/payments/paystack");
    expect(toPesewas(430.1)).toBe(43010);
    expect(fromPesewas(43010)).toBe(430.1);
  });

  it("accepts only successful GHS transactions matching the reference", async () => {
    const { verifyTransaction } = await import("@/lib/payments/paystack");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_x");
    const reply = (data: unknown) => (async () => new Response(JSON.stringify({ status: true, data }), { status: 200 })) as unknown as typeof fetch;
    await expect(verifyTransaction("r1", reply({ status: "success", amount: 5000, currency: "GHS", id: 9, reference: "r1" }))).resolves.toMatchObject({ ok: true, amountGhs: 50, id: "9" });
    await expect(verifyTransaction("r1", reply({ status: "success", amount: 5000, currency: "NGN", id: 9, reference: "r1" }))).resolves.toMatchObject({ ok: false });
    await expect(verifyTransaction("r1", reply({ status: "abandoned", amount: 5000, currency: "GHS", id: 9, reference: "r1" }))).resolves.toMatchObject({ ok: false, status: "abandoned" });
  });
});
