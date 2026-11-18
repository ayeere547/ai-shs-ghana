import { afterEach, describe, expect, it, vi } from "vitest";

import { regionsCsv, type NationalAnalytics } from "@/lib/analytics";
import { friendlyError, limitText } from "@/lib/billing";
import { categoryLabel } from "@/lib/support";

vi.mock("server-only", () => ({}));

const analytics = (by_region: NationalAnalytics["by_region"]): NationalAnalytics => ({
  min_group_size: 3,
  totals: { schools: 0, students: null, female_students: null, male_students: null, staff: null, attendance_rate_30d: null },
  by_region,
  adoption: { active_schools: 0, attendance_30d: 0, assignments_30d: 0, online_exams_30d: 0, ai_30d: 0, fee_invoices_90d: 0, parent_portal: 0 },
  plans: [],
  growth: [],
});

describe("analytics CSV", () => {
  it("keeps suppressed cells blank and neutralises spreadsheet formulas", () => {
    const csv = regionsCsv(analytics([
      { region: "Ashanti", schools: 4, suppressed: false, students: 1200, staff: 80, students_per_staff: 15, attendance_rate_30d: 91.5 },
      { region: "=HYPERLINK(\"x\")", schools: 1, suppressed: true, students: null, staff: null, students_per_staff: null, attendance_rate_30d: null },
    ]));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toMatch(/^Region,Active schools/);
    expect(lines[1]).toBe("Ashanti,4,1200,80,15,91.5,no");
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")",1,,,,,yes`);
  });
});

describe("billing helpers", () => {
  it("passes our own RPC messages through but hides internal database errors", () => {
    expect(friendlyError("this plan has no monthly price yet", "x")).toBe("This plan has no monthly price yet");
    expect(friendlyError("permission denied for table subscriptions", "Nope")).toBe("Nope");
    expect(friendlyError('duplicate key value violates unique constraint "x"', "Nope")).toBe("Nope");
    expect(friendlyError(undefined, "Fallback")).toBe("Fallback");
  });

  it("formats limits", () => {
    expect(limitText(null)).toBe("Unlimited");
    expect(limitText(1500)).toBe("1,500");
    expect(categoryLabel("data_protection")).toMatch(/Data protection/);
  });
});

describe("Paystack subscriptions", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("only accepts Paystack checkout URLs", async () => {
    const { isPaystackCheckoutUrl } = await import("@/lib/payments/paystack");
    expect(isPaystackCheckoutUrl("https://checkout.paystack.com/abc")).toBe(true);
    expect(isPaystackCheckoutUrl("https://paystack.co/pay/x")).toBe(true);
    expect(isPaystackCheckoutUrl("https://paystack.com.evil.example/x")).toBe(false);
    expect(isPaystackCheckoutUrl("http://checkout.paystack.com/abc")).toBe(false);
  });

  it("sends platform subscription payments without a school subaccount", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_abc");
    const { initializeTransaction } = await import("@/lib/payments/paystack");
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/x" } }), { status: 200, headers: { "x-body": String(init?.body) } }));
    await initializeTransaction({ email: "a@b.example", amountGhs: 200, reference: "AISHS-SUB-1", callbackUrl: "https://x.example/cb", metadata: {} }, fetchImpl as unknown as typeof fetch);
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ amount: 20000, currency: "GHS", reference: "AISHS-SUB-1" });
    expect(body.subaccount).toBeUndefined();
    expect(body.bearer).toBeUndefined();

    await initializeTransaction({ email: "a@b.example", amountGhs: 50, reference: "AISHS-1", subaccount: "ACCT_x", callbackUrl: "https://x.example/cb", metadata: {} }, fetchImpl as unknown as typeof fetch);
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toMatchObject({ subaccount: "ACCT_x", bearer: "subaccount" });
  });
});

describe("cron authorisation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires the exact bearer secret and refuses when none is configured", async () => {
    const { isCronAuthorised } = await import("@/lib/cron");
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronAuthorised("Bearer ")).toBe(false);
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect(isCronAuthorised("Bearer s3cret-value")).toBe(true);
    expect(isCronAuthorised("Bearer s3cret-valuf")).toBe(false);
    expect(isCronAuthorised("Bearer short")).toBe(false);
    expect(isCronAuthorised(null)).toBe(false);
  });
});
