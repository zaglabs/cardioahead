import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
const localEnv = {
  CARDIOAHEAD_LOCAL_TEST: "true",
  CARDIOAHEAD_LOCAL_PASSWORD: "local-e2e-password-only",
  CARDIOAHEAD_SESSION_SECRET: "e2e-only-secret-do-not-use-for-live-deployments",
  CARDIOAHEAD_LOCAL_DATA_DIR: path.join(
    process.cwd(),
    ".local-test-data",
    "run-" + Date.now(),
  ),
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
};
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 60000,
      env: localEnv,
    },
    {
      command: "npm run start -- --port 3110",
      url: "http://127.0.0.1:3110",
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...localEnv,
        VERCEL: "1",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3110",
      },
    },
  ],
});
