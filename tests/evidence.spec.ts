import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
type API = import("@playwright/test").APIRequestContext;
const fixture = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), "public/test-documents", name));
async function make(owner: API, origin: string, label: string) {
  const headers = { origin };
  const result = await owner.post("/api/clinic/appointments", {
    headers,
    data: { mode: "clinic", patientLabel: label },
  });
  expect(result.status()).toBe(201);
  const card = (await result.json()).appointment;
  const endpoint = "/api/clinic/appointments/" + card.id;
  expect(
    (
      await owner.post(endpoint + "/documents", {
        headers,
        multipart: {
          file: {
            name: "echo.pdf",
            mimeType: "application/pdf",
            buffer: fixture("02-echocardiogram-he.pdf"),
          },
        },
      })
    ).status(),
  ).toBe(201);
  return { endpoint, headers, card };
}
async function ready(owner: API, endpoint: string) {
  await expect
    .poll(
      async () =>
        (await (await owner.get(endpoint + "/evidence")).json()).review?.status,
      { timeout: 45000 },
    )
    .toBe("ready");
  return await (await owner.get(endpoint + "/evidence")).json();
}
test("clinician requests a source-linked evidence review and revisits it; changed PDFs mark it stale and regeneration preserves history", async ({
  page,
  playwright,
}) => {
  test.setTimeout(100000);
  const origin =
    test.info().project.name === "mobile"
      ? "http://127.0.0.1:3120"
      : "http://127.0.0.1:3100";
  const state =
    test.info().project.name === "mobile"
      ? "tmp/claude-owner-auth.json"
      : "tmp/owner-auth.json";
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: state,
  });
  const label = "Fictional evidence " + test.info().project.name;
  const { endpoint, headers } = await make(owner, origin, label);
  await page
    .context()
    .addCookies(JSON.parse(fs.readFileSync(state, "utf8")).cookies);
  await page.goto(origin + "/admin?lang=en");
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page
    .getByRole("tab", { name: "Clinical Evidence & Options", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate Evidence Review", exact: true }),
  ).toBeVisible();
  expect(
    (await (await owner.get(endpoint + "/evidence")).json()).review,
  ).toBeNull();
  await page.getByLabel("Request type").selectOption("plan");
  const question =
    "Consider SGLT2 applicability for Jane Doe 123456789 jane@example.com +972-555-5555";
  await page.getByLabel("What would you like to assess?").fill(question);
  await page
    .getByRole("button", { name: "Generate Evidence Review", exact: true })
    .click();
  const data = await ready(owner, endpoint),
    review = data.review;
  expect(
    review.report.claims.some(
      (c: { section: string }) => c.section === "proposed_plan",
    ),
  ).toBe(true);
  expect(
    review.retrieval.sources.every((s: { url: string }) =>
      s.url.startsWith("https://pubmed.ncbi.nlm.nih.gov/"),
    ),
  ).toBe(true);
  expect(
    review.retrieval.sources.some(
      (s: { access: string }) => s.access === "abstract_only",
    ),
  ).toBe(true);
  expect(
    review.retrieval.sources.some(
      (s: { access: string }) => s.access === "full_text_excerpts",
    ),
  ).toBe(true);
  for (const search of review.retrieval.searches)
    for (const identifier of ["Jane", "123456789", "jane@example.com", "+972"])
      expect(search.query).not.toContain(identifier);
  expect(review).not.toHaveProperty("lease_until");
  await expect(page.locator(".evidence-overview")).toBeVisible({
    timeout: 15000,
  });
  await page
    .locator(".evidence-section")
    .filter({
      has: page.locator("summary", {
        hasText: "Case overview and missing information",
      }),
    })
    .locator("> summary")
    .click();
  await expect(
    page.getByText("Missing patient information", { exact: true }).first(),
  ).toBeVisible();
  await page.locator(".evidence-overview .source-evidence summary").click();
  await page.locator(".evidence-overview .source-evidence a").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close document" }).click();
  await page.screenshot({
    path: "tmp/evidence-" + test.info().project.name + ".png",
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 920 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  const reused = await owner.post(endpoint + "/evidence", {
    headers,
    data: { action: "generate", question, questionKind: "plan" },
  });
  expect(reused.status()).toBe(200);
  expect((await reused.json()).id).toBe(review.id);
  await page.reload();
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page.getByRole("tab", { name: "Clinical Evidence & Options" }).click();
  await expect(page.locator(".evidence-overview")).toBeVisible();
  const uploaded = await owner.post(endpoint + "/documents", {
    headers,
    multipart: {
      file: {
        name: "referral.pdf",
        mimeType: "application/pdf",
        buffer: fixture("01-cardiology-referral-he.pdf"),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  expect(
    (await (await owner.get(endpoint + "/evidence")).json()).review.outdated,
  ).toBe(true);
  await page.getByRole("button", { name: "Refresh appointments" }).click();
  await expect(
    page.getByText("Documents changed — this review may be outdated", {
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await owner.post(endpoint + "/evidence", {
            headers,
            data: { action: "regenerate", question, questionKind: "plan" },
          })
        ).status(),
      { timeout: 20000, intervals: [1000] },
    )
    .toBe(202);
  const updated = await ready(owner, endpoint);
  expect(updated.review.id).not.toBe(review.id);
  expect(updated.history).toHaveLength(2);
  expect(updated.review.outdated).toBe(false);
  expect(
    (await (await owner.get(endpoint + "/evidence?review=" + review.id)).json())
      .review.outdated,
  ).toBe(true);
  await page.goto(origin + "/admin?lang=he");
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page
    .getByRole("tab", { name: "ראיות קליניות ואפשרויות טיפול", exact: true })
    .click();
  await expect(
    page.getByText(
      "סקירת ראיות בסיוע AI לעיון הרופא. ההחלטות הרפואיות מתקבלות על ידי הרופא המטפל.",
      { exact: true },
    ),
  ).toBeVisible();
  await owner.dispose();
});
test("failed and empty searches are explicit; invented citations and unsupported interpretations are omitted", async ({
  playwright,
}) => {
  test.setTimeout(90000);
  const origin = "http://127.0.0.1:3100",
    owner = await playwright.request.newContext({
      baseURL: origin,
      storageState: "tmp/owner-auth.json",
    });
  for (const [question, condition] of [
    ["Could myocarditis apply?", "failure"],
    ["Could takotsubo apply?", "empty"],
    ["Check unsupported assumptions", "unsupported"],
  ] as const) {
    const { endpoint, headers } = await make(
      owner,
      origin,
      "Fictional limited " + condition + " " + test.info().project.name,
    );
    expect(
      (
        await owner.post(endpoint + "/evidence", {
          headers,
          data: { action: "generate", question },
        })
      ).status(),
    ).toBe(202);
    const { review } = await ready(owner, endpoint);
    expect(review.report.incomplete).toBe(true);
    if (condition === "unsupported") {
      expect(review.report.omitted_claims).toBe(2);
      expect(
        review.report.claims.every(
          (c: { text: { en: string }; refs: { source_id: string }[] }) =>
            !c.text.en.includes("unsupported interpretation") &&
            c.refs.every((r) => r.source_id !== "PMID:99999999"),
        ),
      ).toBe(true);
    } else {
      expect(review.report.claims).toHaveLength(0);
      expect(review.retrieval.limitations).toContain(
        "NO_RELEVANT_READABLE_EVIDENCE",
      );
      expect(
        review.retrieval.searches.every(
          (s: { failure: string; count: number }) =>
            condition === "failure" ? Boolean(s.failure) : s.count === 0,
        ),
      ).toBe(true);
    }
  }
  await owner.dispose();
});
test("evidence stays inaccessible to patient sessions, secretaries, pending users and unauthenticated requests", async ({
  page,
  playwright,
}) => {
  const origin = "http://127.0.0.1:3100",
    headers = { origin },
    owner = await playwright.request.newContext({
      baseURL: origin,
      storageState: "tmp/owner-auth.json",
    });
  const create = await (
    await owner.post("/api/clinic/appointments", {
      headers,
      data: {
        patientLabel: "Fictional access " + test.info().project.name,
        language: "en",
      },
    })
  ).json();
  const endpoint =
    "/api/clinic/appointments/" + create.appointment.id + "/evidence";
  const patient = await playwright.request.newContext({ baseURL: origin });
  expect((await patient.get(endpoint)).status()).toBe(401);
  await patient.post("/api/patient/verify", {
    headers,
    data: {
      token: new URL(create.invitationUrl).pathname.split("/").pop(),
      code: create.code,
    },
  });
  expect((await patient.get(endpoint)).status()).toBe(401);
  expect(
    (
      await patient.post(endpoint, { headers, data: { action: "generate" } })
    ).status(),
  ).toBe(401);
  const member = await playwright.request.newContext({ baseURL: origin }),
    email = "evidence-" + randomUUID() + "@example.test";
  await member.post("/api/clinic/auth", {
    headers,
    data: { action: "request", email },
  });
  const outbox = await (
    await member.get("http://127.0.0.1:3199/outbox?email=" + email)
  ).json();
  await member.post("/api/clinic/auth", {
    headers,
    data: {
      action: "verify",
      email,
      code: outbox.at(-1).text.match(/\b\d{6}\b/)[0],
    },
  });
  expect((await member.get(endpoint)).status()).toBe(403);
  const users = (await (await owner.get("/api/clinic/users")).json()).users,
    user = users.find((u: { email: string }) => u.email === email);
  await owner.patch("/api/clinic/users", {
    headers,
    data: { id: user.id, status: "active", role: "secretary" },
  });
  expect((await member.get(endpoint)).status()).toBe(403);
  expect(
    (
      await member.post(endpoint, { headers, data: { action: "generate" } })
    ).status(),
  ).toBe(403);
  await page.context().addCookies((await member.storageState()).cookies);
  await page.goto("/admin?lang=en");
  await expect(
    page.getByRole("tab", { name: "Clinical Evidence & Options" }),
  ).toHaveCount(0);
  expect(
    (
      await owner.post(endpoint, {
        headers: { origin: "https://other.test" },
        data: { action: "generate" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.post(endpoint, { headers, data: { action: "generate" } })
    ).status(),
  ).toBe(409);
  await owner.dispose();
  await member.dispose();
  await patient.dispose();
});
