import { test, expect } from "@playwright/test";
import fs from "node:fs";
const origin = "http://127.0.0.1:3120",
  headers = { origin };
const recordId = "99999999-9999-4999-8999-999999999991",
  otherId = "99999999-9999-4999-8999-999999999992";
const bundle = {
  schema_version: 1,
  provider: "clalit",
  subject_scope: "self",
  collected_at: "2026-01-01T00:00:00Z",
  coverage: [
    { category: "laboratory", status: "captured", record_count: 1 },
    { category: "other", status: "captured", record_count: 1 },
    { category: "medications", status: "menu_not_recognized", record_count: 0 },
  ],
  records: [
    {
      id: recordId,
      category: "laboratory",
      title: "Fictional lab report",
      record_date: "01.01.2026",
      provider_reference: "FAKE-LAB-001",
      source_origin: "https://e-services.clalit.co.il",
      source_path: "/fictional-lab",
      association_verified: true,
      entries: [
        { id: "entry_1", text: "FICTIONAL_ALPHA: 7.3 mg/dL" },
        { id: "entry_2", text: "UNREFERENCED_FICTIONAL_VALUE: 1.25" },
      ],
    },
    {
      id: otherId,
      category: "other",
      title: "Fictional peripheral record",
      record_date: "01.01.2025",
      provider_reference: "FAKE-OTHER-001",
      source_origin: "https://e-services.clalit.co.il",
      source_path: "/fictional-other",
      association_verified: true,
      entries: [
        {
          id: "entry_1",
          text: "Fictional peripheral source context for exclusion review.",
        },
      ],
    },
  ],
};
test("personal structured import is scoped, source cited, document-free and reviewable on desktop and mobile", async ({
  page,
  playwright,
}) => {
  test.setTimeout(90000);
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/claude-owner-auth.json",
  });
  const created = await owner.post("/api/clinic/appointments", {
    headers,
    data: {
      mode: "clinic",
      patientLabel: "Personal import fixture " + test.info().project.name,
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).appointment.id;
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  expect(
    (
      await anonymous.post(
        "/api/clinic/appointments/" + id + "/medical-records",
        {
          headers,
          data: {
            action: "connect",
            subject_scope: "self",
            claude_consent: true,
          },
        },
      )
    ).status(),
  ).toBe(401);
  const grant = await owner.post(
    "/api/clinic/appointments/" + id + "/medical-records",
    {
      headers,
      data: { action: "connect", subject_scope: "self", claude_consent: true },
    },
  );
  expect(grant.status()).toBe(201);
  const grantData = await grant.json();
  const token = new URLSearchParams(
    new URL(grantData.connect_url).hash.slice(1),
  ).get("token")!;
  const capability = { authorization: "Bearer " + token };
  const invalid = await anonymous.post("/api/clinic/medical-imports/upload", {
    headers: capability,
    data: { ...bundle, subject_scope: "family" },
  });
  expect(invalid.status()).toBe(400);
  const uploaded = await anonymous.post("/api/clinic/medical-imports/upload", {
    headers: capability,
    data: bundle,
  });
  expect(uploaded.status()).toBe(202);
  expect((await uploaded.json()).original_documents_saved).toBe(false);
  await expect
    .poll(
      async () => {
        const response = await owner.get(
          "/api/clinic/appointments/" + id + "/medical-records",
        );
        return (await response.json()).record?.status;
      },
      { timeout: 30000 },
    )
    .toBe("ready");
  const saved = (
    await (
      await owner.get("/api/clinic/appointments/" + id + "/medical-records")
    ).json()
  ).record;
  expect(saved.bundle.records[0].entries).toHaveLength(1);
  expect(JSON.stringify(saved)).not.toContain("UNREFERENCED_FICTIONAL_VALUE");
  expect(saved.visual).toBeNull();
  expect(saved.summary.relevance).toHaveLength(2);
  const rerun = await anonymous.post("/api/clinic/medical-imports/upload", {
    headers: capability,
    data: bundle,
  });
  expect((await rerun.json()).reused).toBe(true);
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/claude-owner-auth.json", "utf8")).cookies,
    );
  await page.goto(origin + "/admin?lang=en");
  await page
    .getByRole("button")
    .filter({ hasText: "Personal import fixture " + test.info().project.name })
    .first()
    .click();
  await expect(page.getByRole("tab", { name: "Sources (2)" })).toBeVisible();
  await page.getByRole("button", { name: /Fictional lab report/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("FAKE-LAB-001"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText(/original record remains in Clalit/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("tab", { name: "Pre-visit summary" }).click();
  await expect(
    page.getByRole("heading", { name: "Pre-visit summary draft" }),
  ).toBeVisible();
  await page
    .getByText("Cardiology relevance and exclusion audit", { exact: true })
    .click();
  await expect(
    page.getByText("Fictional peripheral record", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark relevant for review" }).click();
  await expect(
    page.getByText("Relevant per clinician", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Visual Explanation" }).click();
  await expect(page.getByText(/No documented cardiac anatomy/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Create Visual Explanation/ }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "tmp/personal-import-" + test.info().project.name + ".png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  // Evidence and lifestyle generation must use consent-bound Claude calls and the new web-record excerpts.
  const clinical = "/api/clinic/appointments/" + id;
  const evidence = await owner.post(clinical + "/evidence", {
    headers,
    data: {
      action: "generate",
      request_type: "question",
      question: "Review fictional source context",
    },
  });
  expect(evidence.status(), await evidence.text()).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await owner.get(clinical + "/evidence")).json()).review?.status,
      { timeout: 45000 },
    )
    .toBe("ready");
  const review = (await (await owner.get(clinical + "/evidence")).json())
    .review;
  expect(
    review.context.documents.every(
      (source: { kind: string }) => source.kind === "web_record",
    ),
  ).toBe(true);
  const lifestyle = await owner.post(clinical + "/visit", {
    headers,
    data: { action: "generate_lifestyle" },
  });
  expect(lifestyle.status(), await lifestyle.text()).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await owner.get(clinical + "/visit")).json()).jobs.find(
          (job: { kind: string; status: string }) => job.kind === "lifestyle",
        )?.status,
      { timeout: 45000 },
    )
    .toBe("ready");
  const providerCalls = (
    await (await owner.get("http://127.0.0.1:3198/calls")).json()
  ).filter((call: { ids?: string[] }) => call.ids?.includes(recordId));
  expect(
    providerCalls.some(
      (call: { task: string; provider: string }) =>
        call.task === "evidence_verify" && call.provider === "claude",
    ),
  ).toBe(true);
  expect(
    providerCalls.some(
      (call: { task: string; provider: string }) =>
        call.task === "lifestyle_verify" && call.provider === "claude",
    ),
  ).toBe(true);
  await owner.dispose();
  await anonymous.dispose();
});
