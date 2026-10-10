import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
test("admin checks Anthropic without exposing keys, selects a tested model and new streamed drafts use it", async ({
  page,
  playwright,
}) => {
  test.skip(
    test.info().project.name === "mobile",
    "This isolated settings workflow checks all mobile widths in one session.",
  );
  test.setTimeout(90000);
  const origin = "http://127.0.0.1:3130",
    headers = { origin },
    owner = await playwright.request.newContext({
      baseURL: origin,
      storageState: "tmp/settings-owner-auth.json",
    });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  expect((await anonymous.get("/api/clinic/ai-settings")).status()).toBe(401);
  const failedCheck = await owner.post("/api/clinic/ai-settings", {
    headers,
    data: { action: "check", model: "claude-unsupported" },
  });
  expect(failedCheck.status()).toBe(503);
  expect((await failedCheck.json()).models).toHaveLength(2);
  const config = await (await owner.get("/api/clinic/ai-settings")).json();
  expect(config.masked_key).toBe("••••••••••••••••");
  expect(JSON.stringify(config)).not.toContain("local-claude-test-key");
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/settings-owner-auth.json", "utf8"))
        .cookies,
    );
  await page.goto(origin + "/admin/api-keys?lang=en");
  await expect(
    page.getByRole("heading", { name: "API Keys", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check connection and load models" })
    .click();
  await expect(
    page.getByText("Connection and model verified", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Anthropic model").locator("option"),
  ).toHaveCount(2);
  await page
    .getByLabel("Anthropic model")
    .selectOption("claude-haiku-4-5-20251001");
  await page.getByRole("button", { name: "Save model", exact: true }).click();
  await expect(
    page.getByText("Model saved. New AI requests will use it.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await owner.get("/api/clinic/ai-settings")).json()).model,
  ).toBe("claude-haiku-4-5-20251001");
  expect(
    (
      await owner.post("/api/clinic/ai-settings", {
        headers: { origin: "https://invalid.example" },
        data: { action: "save", model: "claude-sonnet-4-6" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.post("/api/clinic/ai-settings", {
        headers,
        data: { action: "save", model: "claude-unsupported" },
      })
    ).status(),
  ).toBe(503);
  // Independent owner-only authorization: an approved professor still cannot access key settings.
  const staff = await playwright.request.newContext({ baseURL: origin }),
    email = "model-staff-" + randomUUID() + "@example.test";
  await staff.post("/api/clinic/auth", {
    headers,
    data: { action: "request", email },
  });
  const box = await (
      await owner.get("http://127.0.0.1:3199/outbox?email=" + email)
    ).json(),
    code = box.at(-1).text.match(/\b\d{6}\b/)[0];
  await staff.post("/api/clinic/auth", {
    headers,
    data: { action: "verify", email, code },
  });
  const account = (
    await (await owner.get("/api/clinic/users")).json()
  ).users.find((v: { email: string }) => v.email === email);
  await owner.patch("/api/clinic/users", {
    headers,
    data: { id: account.id, status: "active", role: "professor" },
  });
  expect((await staff.get("/api/clinic/ai-settings")).status()).toBe(403);
  expect(
    (
      await staff.post("/api/clinic/ai-settings", {
        headers,
        data: { action: "check" },
      })
    ).status(),
  ).toBe(403);
  for (const width of [320, 390, 768, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390)
      await page.screenshot({
        path: "tmp/anthropic-settings-mobile.png",
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "tmp/anthropic-settings-wide.png",
    fullPage: true,
  });
  const label = "Streamed lifecycle " + randomUUID().slice(0, 8),
    r = await owner.post("/api/clinic/appointments", {
      headers,
      data: { mode: "clinic", patientLabel: label },
    });
  const id = (await r.json()).appointment.id,
    ep = "/api/clinic/appointments/" + id;
  await owner.post(ep + "/documents", {
    headers,
    multipart: {
      file: {
        name: "echo.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(
          "public/test-documents/02-echocardiogram-he.pdf",
        ),
      },
    },
  });
  await page.goto(origin + "/admin?lang=en");
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page
    .getByRole("tab", { name: "Prevention & Lifestyle", exact: true })
    .click();
  await expect(
    page.getByText("Click Generate Draft to start.", { exact: false }),
  ).toBeVisible();
  const generate = page.getByRole("button", {
    name: "Generate Draft",
    exact: true,
  });
  await expect(generate).toHaveClass(/button-dark/);
  await generate.click();
  await expect
    .poll(
      async () =>
        (await (await owner.get(ep + "/visit")).json()).heads.lifestyle?.data
          .sections.length,
      { timeout: 45000 },
    )
    .toBeGreaterThan(0);
  const calls = await (await owner.get("http://127.0.0.1:3198/calls")).json();
  expect(
    calls.some(
      (v: { task: string; model: string; streaming: boolean }) =>
        v.task === "lifestyle_draft" &&
        v.model === "claude-haiku-4-5-20251001" &&
        v.streaming,
    ),
  ).toBe(true);
  await expect(page.locator(".lifestyle-editor").first()).toBeVisible({
    timeout: 12000,
  });
  const width = await page
    .locator(".demo-main")
    .evaluate((e) => e.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(1800);
  await page.screenshot({ path: "tmp/clinic-full-width.png", fullPage: true });
  await owner.dispose();
  await anonymous.dispose();
  await staff.dispose();
});
