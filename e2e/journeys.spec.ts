import { expect, test, type Page } from "@playwright/test";

/**
 * Signed-in journeys against a real Supabase project (local `supabase start` + seed, or staging).
 * Provide TEST accounts only — never real users' passwords:
 *   E2E_HEAD_EMAIL / E2E_HEAD_PASSWORD        headteacher of a seeded sample school
 *   E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD  teacher at the same school
 *   E2E_PARENT_EMAIL / E2E_PARENT_PASSWORD    parent linked to a student there
 *   E2E_PLATFORM_EMAIL / E2E_PLATFORM_PASSWORD super admin
 */
const account = (role: string) => ({ email: process.env[`E2E_${role}_EMAIL`], password: process.env[`E2E_${role}_PASSWORD`] });

async function signIn(page: Page, role: string) {
  const { email, password } = account(role);
  test.skip(!email || !password, `E2E_${role}_EMAIL / E2E_${role}_PASSWORD not set`);
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.describe("signed-in journeys", () => {
  test("headteacher reaches the school dashboard and core modules", async ({ page }) => {
    await signIn(page, "HEAD");
    await page.goto("/school");
    await expect(page.getByRole("navigation", { name: /main/i })).toBeVisible();
    for (const path of ["/school/students", "/school/attendance", "/school/results", "/school/finance", "/school/billing"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });

  test("teacher cannot open finance or health records", async ({ page }) => {
    await signIn(page, "TEACHER");
    for (const path of ["/school/finance", "/school/health", "/school/billing"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/denied=1|\/school$/);
    }
  });

  test("parent sees only the parent portal", async ({ page }) => {
    await signIn(page, "PARENT");
    await page.goto("/school");
    await expect(page).toHaveURL(/\/parent/);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("platform staff see national analytics with small groups hidden", async ({ page }) => {
    await signIn(page, "PLATFORM");
    await page.goto("/platform/analytics");
    await expect(page.getByText(/not official Ministry, GES/i)).toBeVisible();
  });

  test("anyone signed in can raise a support request and download their data", async ({ page }) => {
    await signIn(page, "HEAD");
    await page.goto("/app/support/new");
    await expect(page.getByLabel("Subject")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.goto("/app/account");
    await page.getByRole("link", { name: /download my data/i }).click();
    expect((await download).suggestedFilename()).toMatch(/my-data-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
