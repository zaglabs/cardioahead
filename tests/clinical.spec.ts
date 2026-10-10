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
  await page.getByRole("tab", { name: "Visual Explanation" }).click();
  await expect(
    page.getByText(
      "Proposal for Prof. Maor — no visual explanation created yet",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Create Visual Explanation",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".presentation-viewer")).toHaveCount(0);
  expect((await (await owner.get(endpoint)).json()).presentation).toBeNull();
  await page.screenshot({
    path: "tmp/presentation-proposal-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create Visual Explanation", exact: true })
    .click();
  await expect(page.locator(".presentation-viewer")).toBeVisible();
  await expect(page.locator("svg.clinical-scene").first()).toBeVisible();
  const saved = (await (await owner.get(endpoint)).json()).presentation;
  expect(saved.content.renderer_version).toBe(1);
  expect(saved.content.sources).toHaveLength(2);
  expect(await calls()).toBe(1);
  await page.getByRole("button", { name: "Pause animation" }).click();
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
  await page.getByRole("tab", { name: "Visual Explanation" }).click();
  await expect(page.locator(".presentation-viewer")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Create Visual Explanation",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel("Choose language").selectOption("he");
  await expect(
    page.getByText("הסבר חזותי שמור בתיק", { exact: false }),
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
      name: "Mark visual explanation reviewed for patient discussion",
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

test("summary heartbeat follows processing state and stops on failure", async ({
  page,
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  const label = "Failure UI " + test.info().project.name;
  const invitation = await (
    await owner.post("/api/clinic/appointments", {
      headers,
      data: { patientLabel: label, language: "en" },
    })
  ).json();
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  let state = "generating";
  await page.route("**/api/clinic/appointments", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    result.appointments = result.appointments.map(
      (a: { id: string; status: string }) =>
        a.id === invitation.appointment.id ? { ...a, status: "submitted" } : a,
    );
    await route.fulfill({ response, json: result });
  });
  await page.route(
    "**/api/clinic/appointments/" + invitation.appointment.id + "/analysis",
    async (route) => {
      if (route.request().method() !== "GET")
        throw new Error("A failed report must not automatically retry");
      await route.fulfill({
        json: {
          analysis: {
            status: state,
            summary: null,
            sources: [],
            error_code: state === "failed" ? "AI_REQUEST_FORMAT" : null,
            attempts: 1,
          },
          presentation: null,
          configured: true,
          can_resume: false,
        },
      });
    },
  );
  await page.goto("/admin?lang=en");
  await page.getByRole("button", { name: "Refresh appointments" }).click();
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page.getByRole("tab", { name: "Pre-visit summary" }).click();
  await expect(
    page.getByRole("heading", { name: "Preparing the document summary." }),
  ).toBeVisible();
  await expect(page.locator(".empty-report")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  const heart = page.locator(".summary-heart-loader");
  await expect(heart).toBeVisible();
  expect(await heart.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "summary-heartbeat",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await heart.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.screenshot({
    path: "tmp/summary-heart-" + test.info().project.name + ".png",
    fullPage: true,
  });
  state = "failed";
  await expect(
    page.getByRole("heading", { name: "Summary preparation failed." }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".summary-heart-loader")).toHaveCount(0);
  await expect(page.locator(".empty-report")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(
    page.getByText(
      "The AI service rejected the request format. The integration needs a correction.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Preparing the document summary.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry summary preparation" }),
  ).toBeEnabled();
  await page.getByLabel("Choose language").selectOption("he");
  await expect(
    page.getByRole("heading", { name: "הכנת הסיכום נכשלה." }),
  ).toBeVisible();
  await expect(
    page.getByText("שירות ה-AI דחה את מבנה הבקשה. נדרש תיקון בחיבור המערכת.", {
      exact: true,
    }),
  ).toBeVisible();
  await owner.dispose();
});

test("patient comparison and markers follow cited findings and preserve unknown anatomy", async ({
  page,
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  const label = "Patient visual " + test.info().project.name;
  const invitation = await (
    await owner.post("/api/clinic/appointments", {
      headers,
      data: { patientLabel: label, language: "en" },
    })
  ).json();
  const bi = (s: string) => ({ he: s, en: s });
  const fact = (text: string, quote: string) => ({
    text: bi(text),
    date: null,
    refs: [{ document_id: "visual-source", page: 1, quote }],
  });
  const source = {
    document_id: "visual-source",
    filename: "fictional-case.pdf",
    pages: 1,
    sha256: "test",
  };
  const slides = [
    {
      kind: "pumping",
      title: bi("Documented reduced LV function"),
      bullets: [
        fact(
          "Reduced left ventricular systolic function",
          "הרחבה קלה של חדר שמאל וירידה בתפקוד הסיסטולי.",
        ),
      ],
      key_value: bi("EF 38% — documented"),
    },
    {
      kind: "stent",
      title: bi("Historical coronary procedure"),
      bullets: [fact("Prior LAD PCI in 2018 (historical)", "LAD PCI in 2018")],
      key_value: null,
    },
    {
      kind: "valve",
      title: bi("Documented mitral finding"),
      bullets: [fact("Mitral stenosis", "Mitral stenosis")],
      key_value: null,
    },
    {
      kind: "rhythm",
      title: bi("Location not documented"),
      bullets: [
        fact(
          "Rhythm problem, location not specified",
          "Rhythm information unavailable",
        ),
      ],
      key_value: null,
    },
  ].map((s) => ({
    ...s,
    explanation: bi("Additional mechanism explanation for the clinician"),
  }));
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  await page.route(
    "**/api/clinic/appointments/" + invitation.appointment.id + "/analysis",
    async (route) => {
      if (route.request().method() !== "GET")
        throw new Error("Reopening must not recreate a saved presentation");
      await route.fulfill({
        json: {
          configured: true,
          can_resume: false,
          analysis: {
            status: "ready",
            summary: {
              presentation: { eligible: true, reason: bi("Test"), slides },
            },
            sources: [source],
            attempts: 1,
          },
          presentation: {
            id: "saved-visual",
            created_at: "2026-10-10T10:00:00Z",
            content: {
              renderer_version: 1,
              title: bi("Test"),
              sources: [source],
              slides,
            },
          },
        },
      });
    },
  );
  await page.goto("/admin?lang=en");
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page.getByRole("tab", { name: "Visual Explanation" }).click();
  await expect(
    page.getByText(
      "For clinician-led visual explanation during the consultation",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("An explanation to discuss with your doctor", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".patient-heart-comparison svg")).toHaveCount(2);
  await expect(page.locator('[data-focus-area="lv"]')).toBeVisible();
  await page.getByRole("button", { name: "Show ejection" }).click();
  const normal = await page
    .locator('[data-view="reference"] .lv-cavity')
    .getAttribute("transform");
  expect(
    await page
      .locator('[data-view="patient"] .lv-cavity')
      .getAttribute("transform"),
  ).not.toBe(normal);
  await page.locator(".presentation-viewer").screenshot({
    path: "tmp/patient-comparison-" + test.info().project.name + ".png",
  });
  await page.getByRole("button", { name: "Highlight documented area" }).click();
  await expect(page.locator(".patient-area-view svg")).toHaveCount(1);
  await page.getByRole("button", { name: "Next slide" }).click();
  await expect(page.locator('[data-focus-area="lad"]')).toBeVisible();
  await expect(page.locator(".artery-plaque")).toHaveCount(0);
  await expect(
    page.getByText("Historical documentation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Illustrate stent support" }),
  ).toHaveCount(0);
  await page.locator(".presentation-viewer").screenshot({
    path: "tmp/patient-lad-location-" + test.info().project.name + ".png",
  });
  await page.getByRole("button", { name: "Next slide" }).click();
  await expect(page.locator('[data-focus-area="mitral"]')).toBeVisible();
  await page.getByRole("button", { name: "Next slide" }).click();
  await expect(page.locator("svg.clinical-scene")).toHaveCount(0);
  await expect(page.locator(".unsupported-patient-visual")).toBeVisible();
  await page.getByLabel("Choose language").selectOption("he");
  await expect(
    page.getByText("להצגה בהנחיית הרופא במהלך הייעוץ", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await owner.dispose();
});

test("a symptom-only saved summary cannot create an assumed patient heart diagram", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  const card = await (
    await owner.post("/api/clinic/appointments", {
      headers,
      data: {
        mode: "clinic",
        patientLabel: "Unsupported visual " + test.info().project.name,
      },
    })
  ).json();
  const id = card.appointment.id,
    endpoint = "/api/clinic/appointments/" + id;
  const upload = await owner.post(endpoint + "/documents", {
    headers,
    multipart: {
      file: {
        name: "referral.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(fixture),
      },
    },
  });
  expect(upload.status()).toBe(201);
  expect(
    (
      await owner.post(endpoint + "/submit", {
        headers,
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(200);
  await expect
    .poll(
      async () =>
        (await (await owner.get(endpoint + "/analysis")).json()).analysis
          ?.status,
      { timeout: 25000 },
    )
    .toBe("ready");
  const create = await owner.post(endpoint + "/analysis", {
    headers,
    data: { action: "create_presentation" },
  });
  expect(create.status()).toBe(409);
  expect(
    (await (await owner.get(endpoint + "/analysis")).json()).presentation,
  ).toBeNull();
  await owner.dispose();
});
