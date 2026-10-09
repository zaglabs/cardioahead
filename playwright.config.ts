import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
const localEnv = {
  CARDIOAHEAD_LOCAL_TEST: "true",
  OPENAI_API_KEY: "local-ai-test-key",
  CARDIOAHEAD_AI_PROVIDER: "openai",
  CARDIOAHEAD_ENABLE_OPENAI_TEST_PDFS: "true",
  CARDIOAHEAD_TEST_OPENAI_URL: "http://127.0.0.1:3198/responses",
  RESEND_API_KEY: "local-resend-test-key",
  RESEND_FROM_EMAIL: "CardioAhead <login@cardioahead.test>",
  CARDIOAHEAD_TEST_RESEND_URL: "http://127.0.0.1:3199/emails",
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
  globalSetup: "./tests/global-setup.ts",
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
      command: "npm run start -- --port 3120",
      url: "http://127.0.0.1:3120",
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...localEnv,
        CARDIOAHEAD_AI_PROVIDER: "claude",
        ANTHROPIC_API_KEY: "local-claude-test-key",
        CARDIOAHEAD_ENABLE_CLAUDE_TEST_PDFS: "true",
        CARDIOAHEAD_LOCAL_DATA_DIR:
          localEnv.CARDIOAHEAD_LOCAL_DATA_DIR + "-claude",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3120",
      },
    },
    {
      command: "node tests/ai-server.mjs",
      url: "http://127.0.0.1:3198/calls",
      reuseExistingServer: false,
    },
    {
      command: "node tests/resend-server.mjs",
      url: "http://127.0.0.1:3199/outbox",
      reuseExistingServer: false,
    },
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
