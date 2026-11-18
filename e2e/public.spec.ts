import { expect, test } from "@playwright/test";

/** Public website, accessibility basics, security headers and API guards. Needs no database. */
const PUBLIC_PAGES = ["/", "/features", "/pricing", "/schools", "/about", "/help", "/contact", "/privacy", "/terms", "/data-protection", "/login", "/register"];

test.describe("public pages", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} renders accessibly without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // Same-origin requests that fail (the browser's automatic /favicon.ico probe is ignored).
      page.on("response", (r) => {
        const u = new URL(r.url());
        if (r.status() >= 400 && u.origin === new URL(page.url() || "http://x").origin && u.pathname !== "/favicon.ico") errors.push(`${r.status()} ${u.pathname}`);
      });
      page.on("console", (m) => m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text()) && errors.push(m.text()));
      const res = await page.goto(path);
      expect(res?.status(), `status for ${path}`).toBeLessThan(400);
      await expect(page.locator("html")).toHaveAttribute("lang", /en/);
      await expect(page.locator("h1").first()).toBeVisible();
      expect(await page.locator("img:not([alt])").count(), "images without alt text").toBe(0);
      // Every form control has an accessible name.
      const unlabelled = await page.locator("input:not([type=hidden]), select, textarea").evaluateAll((els) =>
        els.filter((el) => {
          const e = el as HTMLInputElement;
          return !(e.labels?.length || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.getAttribute("title"));
        }).map((el) => el.outerHTML.slice(0, 80)),
      );
      expect(unlabelled, "unlabelled form controls").toEqual([]);
      // No sideways scrolling on any viewport.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal overflow (px)").toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }

  test("unknown pages return 404", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("never claims an official government partnership", async ({ page }) => {
    for (const path of ["/", "/about", "/features"]) {
      await page.goto(path);
      const text = (await page.locator("body").innerText()).toLowerCase();
      // The site's disclaimer ("not affiliated with or endorsed by GES…") is fine; positive claims are not.
      const claims = text.replace(/not affiliated with or endorsed by[^.]*\./g, "");
      expect(claims).not.toMatch(/official (partner|platform) of (ges|the ministry|waec|nacca)/);
      expect(claims).not.toMatch(/(endorsed|approved|accredited) by (ges|the ministry|waec|nacca)/);
      expect(text).toMatch(/not affiliated with or endorsed by ges/);
    }
  });
});

test.describe("security", () => {
  test("responses carry security headers", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("signed-in areas are not reachable without a session", async ({ page }) => {
    for (const path of ["/app", "/school", "/platform", "/student", "/parent", "/school/finance", "/platform/analytics"]) {
      await page.goto(path);
      expect(new URL(page.url()).pathname, `redirect for ${path}`).toMatch(/^\/(login|setup)$/);
    }
  });

  test("scheduled jobs refuse calls without the secret", async ({ request }) => {
    for (const path of ["/api/cron/notifications", "/api/cron/daily"]) {
      expect((await request.get(path)).status()).toBe(401);
      expect((await request.get(path, { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
    }
  });

  test("payment webhook rejects unsigned requests", async ({ request }) => {
    const res = await request.post("/api/webhooks/paystack", { data: { event: "charge.success", data: { reference: "AISHS-x" } } });
    expect([401, 503]).toContain(res.status()); // 503 when Paystack isn't configured on this deployment
  });

  test("data downloads need the right session", async ({ request }) => {
    expect((await request.get("/app/account/export", { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
    expect((await request.get("/platform/analytics/export", { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
  });

  test("health check reports status without leaking configuration", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(expect.arrayContaining(["status"]));
    expect(JSON.stringify(body)).not.toMatch(/key|secret|supabase\.co/i);
  });
});
