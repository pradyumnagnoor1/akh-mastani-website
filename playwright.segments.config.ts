import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/team",
  testDir: "./tests/e2e",
  testMatch: [
    "segments.spec.ts",
    "communication.spec.ts",
    "payments.spec.ts",
    "calendar.spec.ts",
    "operations.spec.ts",
    "calendar-connect.spec.ts",
    "pwa.spec.ts",
    "refresh.spec.ts",
    "management.spec.ts",
    "navigation.spec.ts",
  ],
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3102", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.platform === "darwin" ? "chrome" : undefined,
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: process.platform === "darwin" ? "chrome" : undefined,
      },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/fixtures-server.mjs",
      url: "http://127.0.0.1:3201/health",
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3102",
      url: "http://127.0.0.1:3102/login",
      timeout: 60000,
      reuseExistingServer: false,
      env: {
        GOOGLE_CALENDAR_ID: "fixture-calendar",
        GOOGLE_CALENDAR_CLIENT_ID: "fixture-client",
        GOOGLE_CALENDAR_CLIENT_SECRET: "fixture-secret",
        CALENDAR_TOKEN_ENCRYPTION_KEY:
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
        VAPID_PRIVATE_KEY: "",
        VAPID_SUBJECT: "",
        CRON_SECRET: "",
        SUPABASE_SECRET_KEY: "fixture-service-key",
        NEXT_DIST_DIR: ".next-e2e-segments",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3201",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
        APP_ORIGIN: "http://127.0.0.1:3102",
      },
    },
  ],
});
