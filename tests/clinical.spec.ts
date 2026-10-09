import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const origin = "http://127.0.0.1:3100",
  headers = { origin };
const fixture = path.join(
  process.cwd(),
  "public/test-documents/01-cardiology-referral-he.pdf",
);
const echo = path.join(
  process.cwd(),
  "public/test-documents/02-echocardiogram-he.pdf",
);
test("submitted PDFs produce a cited summary; proposal requires explicit creation; saved presentation is reused", async ({
  page,
  playwright,
  browser,
}) => {
  test.setTimeout(60000);
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  const patient = await playwright.request.newContext({ baseURL: origin });
  const created = await owner.post("/api/clinic/appointments", {
    headers,
    data: {
      patientLabel: "Clinical test " + test.info().project.name,
      language: "en",
    },
  });
  expect(created.status()).toBe(201);
  const invitation = await created.json(),
    id = invitation.appointment.id;
  expect(
    (
      await patient.post("/api/patient/verify", {
        headers,
        data: {
          token: new URL(invitation.invitationUrl).pathname.split("/").pop(),
          code: invitation.code,
        },
      })
    ).status(),
  ).toBe(200);
  for (const file of [fixture, echo])
    expect(
      (
        await patient.post("/api/patient/documents", {
          headers,
          multipart: {
            file: {
              name: path.basename(file),
              mimeType: "application/pdf",
              buffer: fs.readFileSync(file),
            },
          },
        })
      ).status(),
    ).toBe(201);
  expect(
    (
      await owner.post("/api/clinic/appointments/" + id + "/analysis", {
        headers,
        data: { action: "start" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await patient.post("/api/patient/submit", {
        headers,
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(200);
  await expect
    .poll(
      async () => {
        const r = await owner.get(
          "/api/clinic/appointments/" + id + "/analysis",
        );
        return (await r.json()).analysis?.status;
      },
      { timeout: 25000 },
    )
    .toBe("ready");
  const endpoint = "/api/clinic/appointments/" + id + "/analysis";
  const ready = await (await owner.get(endpoint)).json();
  expect(ready.presentation).toBeNull();
  expect(ready.analysis.sources).toHaveLength(2);
  expect(
    ready.analysis.sources.every((s: { pages: number }) => s.pages === 1),
  ).toBe(true);
  expect(ready.analysis).not.toHaveProperty("lease_token");
  expect((await patient.get(endpoint)).status()).toBe(401);
  const sourceId = ready.analysis.sources[0].document_id;
  const calls = async () => {
    const r = await owner.get("http://127.0.0.1:3198/calls");
    return (await r.json()).filter((c: { ids: string[] }) =>
      c.ids.includes(sourceId),
    ).length;
  };
  expect(await calls()).toBe(1);
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  await page.goto("/admin?lang=en");
  await page
    .locator(".case-card")
    .filter({ hasText: "Clinical test " + test.info().project.name })
    .click();
  await page.getByRole("tab", { name: "Pre-visit summary" }).click();
  await expect(
    page.getByText("AI draft for clinician review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Documented findings" }),
  ).toBeVisible();
  await page.locator(".source-evidence summary").first().click();
  await expect(page.locator(".source-evidence a").first()).toHaveAttribute(
    "href",
    /\/api\/clinic\/documents\/.+#page=1/,
  );
  await page.getByRole("tab", { name: "Simulation / presentation" }).click();
  await expect(
    page.getByText("Proposal for Prof. Maor — no presentation created yet", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create presentation", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".presentation-viewer")).toHaveCount(0);
  expect((await (await owner.get(endpoint)).json()).presentation).toBeNull();
  await page.screenshot({
    path: "tmp/presentation-proposal-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create presentation", exact: true })
    .click();
  await expect(page.locator(".presentation-viewer")).toBeVisible();
  await expect(page.locator("svg.clinical-scene")).toBeVisible();
  const saved = (await (await owner.get(endpoint)).json()).presentation;
  expect(saved.content.renderer_version).toBe(1);
  expect(saved.content.sources).toHaveLength(2);
  expect(await calls()).toBe(1);
  await page.getByRole("button", { name: "Animate explanation" }).click();
  await expect(
    page.getByRole("button", { name: "Pause animation" }),
  ).toBeVisible();
  await page.locator(".presentation-viewer").screenshot({
    path: "tmp/presentation-created-" + test.info().project.name + ".png",
  });
  const repeated = await owner.post(endpoint, {
    headers,
    data: { action: "create_presentation" },
  });
  expect(repeated.status()).toBe(200);
  expect((await repeated.json()).presentation.id).toBe(saved.id);
  expect(await calls()).toBe(1);
  await page.reload();
  await page
    .locator(".case-card")
    .filter({ hasText: "Clinical test " + test.info().project.name })
    .click();
  await page.getByRole("tab", { name: "Simulation / presentation" }).click();
  await expect(page.locator(".presentation-viewer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create presentation", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Choose language").selectOption("he");
  await expect(
    page.getByText("מצגת שמורה בתיק", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await owner.post(endpoint, {
        headers: { origin: "https://evil.example" },
        data: { action: "create_presentation" },
      })
    ).status(),
  ).toBe(403);
  await page.getByLabel("בחרו שפה").selectOption("en");
  await page
    .getByRole("button", {
      name: "Mark presentation reviewed for patient discussion",
    })
    .click();
  await expect(
    page.getByText("Reviewed by a doctor / administrator", { exact: true }),
  ).toBeVisible();
  const stranger = await browser.newContext({ baseURL: origin });
  expect((await stranger.request.get(endpoint)).status()).toBe(401);
  await stranger.close();
  await owner.dispose();
  await patient.dispose();
});

test("Claude reads actual approved PDF bytes through Messages and persists the same cited record", async ({
  playwright,
  request,
}) => {
  const base = "http://127.0.0.1:3120",
    h = { origin: base };
  const owner = await playwright.request.newContext({
    baseURL: base,
    storageState: "tmp/claude-owner-auth.json",
  });
  const patient = await playwright.request.newContext({ baseURL: base });
  const invitation = await (
    await owner.post("/api/clinic/appointments", {
      headers: h,
      data: { patientLabel: "Claude test", language: "en" },
    })
  ).json();
  expect(
    (
      await patient.post("/api/patient/verify", {
        headers: h,
        data: {
          token: new URL(invitation.invitationUrl).pathname.split("/").pop(),
          code: invitation.code,
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await patient.post("/api/patient/documents", {
        headers: h,
        multipart: {
          file: {
            name: "private-filename-not-exported.pdf",
            mimeType: "application/pdf",
            buffer: fs.readFileSync(echo),
          },
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await patient.post("/api/patient/submit", {
        headers: h,
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(200);
  const endpoint =
    "/api/clinic/appointments/" + invitation.appointment.id + "/analysis";
  await expect
    .poll(
      async () => {
        const r = await owner.get(endpoint);
        return (await r.json()).analysis?.status;
      },
      { timeout: 25000 },
    )
    .toBe("ready");
  const result = await (await owner.get(endpoint)).json();
  expect(result.analysis.model).toBe("claude-sonnet-4-6");
  expect(result.presentation).toBeNull();
  const calls = await (await request.get("http://127.0.0.1:3198/calls")).json();
  expect(
    calls.some(
      (c: { provider: string; ids: string[] }) =>
        c.provider === "claude" &&
        c.ids.includes(result.analysis.sources[0].document_id),
    ),
  ).toBe(true);
  await owner.dispose();
  await patient.dispose();
});
