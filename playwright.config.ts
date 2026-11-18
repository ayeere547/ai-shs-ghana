import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests.
 * - Default: builds and starts the app on :3410 and runs the public/security suite (no Supabase needed).
 * - E2E_BASE_URL=https://staging.example … runs against a deployed environment instead.
 * - The signed-in journeys in e2e/journeys.spec.ts run only when E2E_* test-account variables are set.
 * - PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's bundled Chromium.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3410";
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel }, testMatch: /public\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run build && npx next start -p 3410", url: "http://localhost:3410/", timeout: 300_000, reuseExistingServer: !process.env.CI, env: { NEXT_TELEMETRY_DISABLED: "1" } },
});
