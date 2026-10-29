import { defineConfig } from "@playwright/test";
import config from "./playwright.segments.config";
export default defineConfig({
  ...config,
  testMatch: ["budget.spec.ts"],
  outputDir: "test-results/budget",
  webServer: Array.isArray(config.webServer)
    ? config.webServer.map((server, index) =>
        index === 0 ? { ...server, env: { BUDGET_FIXTURE: "1" } } : server,
      )
    : config.webServer,
});
