import { defineConfig } from "@playwright/test";
import config from "./playwright.segments.config";
export default defineConfig({
  ...config,
  testMatch: ["navigation-cache.spec.ts", "save-refresh.spec.ts"],
  outputDir: "test-results/speed",
  webServer: Array.isArray(config.webServer)
    ? config.webServer.map((server, index) =>
        index === 1
          ? {
              ...server,
              command:
                "npm run build && npm run start -- --hostname 127.0.0.1 --port 3102",
              timeout: 180000,
              env: { ...server.env, NEXT_DIST_DIR: ".next-e2e-speed" },
            }
          : server,
      )
    : config.webServer,
});
