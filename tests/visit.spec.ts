import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";

const keys = [
  "reason",
  "findings",
  "assessment",
  "plan",
  "medications",
  "referrals",
  "follow_up",
  "warning_signs",
  "prevention",
  "additional",
];
const bi = (en: string, he = "") => ({ en, he });
const blank = () => Object.fromEntries(keys.map((k) => [k, bi("")]));
const fixture = (n: string) =>
  fs.readFileSync(path.join(process.cwd(), "public/test-documents", n));
test("patient reports enforce review, preserve sent versions, verify scoped access, and render bilingual PDFs", async ({
  page,
  playwright,
}) => {
  test.setTimeout(150000);
  const mobile = test.info().project.name === "mobile",
    origin = "http://127.0.0.1:" + (mobile ? 3120 : 3100),
    headers = { origin };
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: mobile ? "tmp/claude-owner-auth.json" : "tmp/owner-auth.json",
  });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  const label =
      "Fictional visit " +
      test.info().project.name +
      " " +
      randomUUID().slice(0, 6),
    email = "report-" + randomUUID() + "@example.test";
  const created = await owner.post("/api/clinic/appointments", {
    headers,
    data: { mode: "clinic", patientLabel: label },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).appointment.id,
    card = "/api/clinic/appointments/" + id,
    ep = card + "/visit";
  async function post(data: object, status = 200) {
    const r = await owner.post(ep, { headers, data });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  }
  async function read() {
    return (await owner.get(ep)).json();
  }
  async function ready(kind: string) {
    await expect
      .poll(
        async () => {
          const d = await read();
          return d.jobs.find(
            (j: { kind: string; status: string }) => j.kind === kind,
          )?.status;
        },
        { timeout: 50000 },
      )
      .toBe("ready");
    return read();
  }
  expect((await anonymous.get(ep)).status()).toBe(401);
  expect(
    (
      await owner.post(card + "/documents", {
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
  const fields = blank();
  fields.reason = bi(
    "Consultation about the supplied echo.",
    "ייעוץ לגבי בדיקת האקו שנמסרה.",
  );
  fields.medications = bi(
    "Continue the clinician-recorded metoprolol 25 mg once daily.",
    "המשך מטופרולול 25 mg פעם ביום בהתאם להוראה שנרשמה.",
  );
  fields.follow_up = bi(
    "Contact the clinic to arrange follow-up.",
    "פנו למרפאה לקביעת מעקב.",
  );
  await post({
    action: "save_findings",
    content: { visit_date: "2026-10-10", fields },
  });
  await post({ action: "generate_lifestyle" }, 202);
  let state = await ready("lifestyle"),
    life = state.heads.lifestyle;
  expect(life.data.sections.length).toBeGreaterThan(0);
  expect(life.data.sections[0].requires_clearance).toBe(true);
  expect(life.data.sections[0].refs.length).toBeGreaterThan(0);
  const edited = structuredClone(life.data);
  edited.sections[0].patient_text.en =
    "Discuss suitable activities with your clinician.";
  life = (
    await post({
      action: "save_lifestyle",
      baseVersionId: life.id,
      content: edited,
    })
  ).version;
  await post(
    {
      action: "generate_lifestyle",
      baseVersionId: life.id,
      decision: "preserve",
    },
    202,
  );
  state = await ready("lifestyle");
  expect(state.heads.lifestyle.id).toBe(life.id);
  expect(state.candidates.length).toBeGreaterThan(0);
  await post({ action: "generate_summary" }, 202);
  state = await ready("summary");
  let summary = state.heads.summary;
  expect(summary.data.fields.medications).toEqual(fields.medications);
  for (const k of [
    "findings",
    "assessment",
    "plan",
    "referrals",
    "warning_signs",
  ])
    expect(summary.data.fields[k]).toEqual(bi(""));
  summary = (
    await post({
      action: "include_lifestyle",
      sourceVersionId: life.id,
      sectionIds: [life.data.sections[0].id],
    })
  ).version;
  const content = structuredClone(summary.data);
  content.clinician_name = mobile ? "פרופ׳ אלעד מאור" : "Prof. Elad Maor";
  content.visit_date = "2026-10-10";
  content.patient_name = "ישראל ישראלי — Fictional";
  content.patient_reference = "TEST-38";
  summary = (
    await post({ action: "save_summary", baseVersionId: summary.id, content })
  ).version;
  const before = (
    await (
      await owner.get("http://127.0.0.1:3199/outbox?email=" + email)
    ).json()
  ).length;
  const preview = await post({
    action: "preview",
    versionId: summary.id,
    language: mobile ? "he" : "en",
    recipient: email,
  });
  await post(
    {
      action: "approve",
      versionId: summary.id,
      language: preview.snapshot.language,
      recipient: email,
      previewHash: preview.hash,
      reviewed: false,
    },
    400,
  );
  await post(
    {
      action: "send",
      approvalId: randomUUID(),
      recipient: email,
      confirmed: true,
    },
    409,
  );
  const approval = (
    await post({
      action: "approve",
      versionId: summary.id,
      language: preview.snapshot.language,
      recipient: email,
      previewHash: preview.hash,
      reviewed: true,
    })
  ).approval;
  expect(
    (
      await (
        await owner.get("http://127.0.0.1:3199/outbox?email=" + email)
      ).json()
    ).length,
  ).toBe(before);
  expect(approval).not.toHaveProperty("pdf_base64");
  const pdf = await owner.get(ep + "/pdf?approval=" + approval.id);
  expect(pdf.status()).toBe(200);
  const pdfBytes = await pdf.body();
  expect(pdfBytes.subarray(0, 4).toString()).toBe("%PDF");
  fs.mkdirSync("tmp/report-qa", { recursive: true });
  fs.writeFileSync(
    "tmp/report-qa/report-" + (mobile ? "he" : "en") + ".pdf",
    pdfBytes,
  );
  const sent = await post({
    action: "send",
    approvalId: approval.id,
    recipient: email,
    confirmed: true,
  });
  const duplicate = await post({
    action: "send",
    approvalId: approval.id,
    recipient: email,
    confirmed: true,
  });
  expect(duplicate.reused).toBe(true);
  let box = await (
    await owner.get("http://127.0.0.1:3199/outbox?email=" + email)
  ).json();
  expect(box.length).toBe(1);
  const notice = box[0];
  for (const value of ["ישראל", "metoprolol", "TEST-38", "25 mg"])
    expect(notice.text).not.toContain(value);
  const link = notice.text.match(
      /http:\/\/127\.0\.0\.1:\d+\/report\/[^\s]+/,
    )[0],
    token = new URL(link).pathname.split("/").at(-1),
    pub = "/api/reports/" + token;
  const patient = await playwright.request.newContext({ baseURL: origin });
  let gate = await (await patient.get(pub)).json();
  expect(gate.verified).toBe(false);
  expect(gate).not.toHaveProperty("report");
  expect((await patient.get(pub + "/pdf")).status()).toBe(401);
  expect(
    (
      await patient.post(pub + "/verify", {
        headers,
        data: { action: "request" },
      })
    ).status(),
  ).toBe(200);
  box = await (
    await owner.get("http://127.0.0.1:3199/outbox?email=" + email)
  ).json();
  const code = box.at(-1).text.match(/\b\d{6}\b/)[0];
  expect(
    (
      await anonymous.post(pub + "/verify", {
        headers,
        data: { action: "verify", code },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await patient.post(pub + "/verify", {
        headers,
        data: { action: "verify", code: "000000" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await patient.post(pub + "/verify", {
        headers,
        data: { action: "verify", code },
      })
    ).status(),
  ).toBe(200);
  gate = await (await patient.get(pub)).json();
  expect(gate.report).toEqual(preview.snapshot);
  const patientPdf = await (await patient.get(pub + "/pdf")).body();
  expect(createHash("sha256").update(patientPdf).digest("hex")).toBe(
    createHash("sha256").update(pdfBytes).digest("hex"),
  );
  expect((await patient.get(ep)).status()).toBe(401);
  expect(
    (
      await patient.post(pub + "/verify", {
        headers,
        data: { action: "verify", code },
      })
    ).status(),
  ).toBe(401);
  const reissued = await post({
    action: "reissue",
    approvalId: approval.id,
    recipient: email,
    confirmed: true,
    deliveryId: sent.delivery_id,
  });
  const repeat = await post({
    action: "reissue",
    approvalId: approval.id,
    recipient: email,
    confirmed: true,
    deliveryId: sent.delivery_id,
  });
  expect(repeat.delivery_id).toBe(reissued.delivery_id);
  expect(repeat.reused).toBe(true);
  expect((await patient.get(pub)).status()).toBe(410);
  content.fields.additional = bi(
    "A corrected clinician note.",
    "הערה מתוקנת של הרופא.",
  );
  summary = (
    await post({ action: "save_summary", baseVersionId: summary.id, content })
  ).version;
  state = await read();
  expect(state.current_approval).toBeNull();
  await post(
    {
      action: "send",
      approvalId: approval.id,
      recipient: email,
      confirmed: true,
    },
    409,
  );
  expect(
    (
      await (await owner.get(ep + "/pdf?approval=" + approval.id)).body()
    ).equals(pdfBytes),
  ).toBe(true);
  // A different source draft must not overwrite the separately copied recommendation.
  const nextLife = structuredClone(life.data);
  nextLife.sections[0].patient_text.en = "Changed later lifestyle source.";
  await post({
    action: "save_lifestyle",
    baseVersionId: life.id,
    content: nextLife,
  });
  expect((await read()).heads.summary.data.lifestyle[0].text.en).toBe(
    "Discuss suitable activities with your clinician.",
  );
  await page
    .context()
    .addCookies(
      JSON.parse(
        fs.readFileSync(
          mobile ? "tmp/claude-owner-auth.json" : "tmp/owner-auth.json",
          "utf8",
        ),
      ).cookies,
    );
  await page.goto(origin + "/admin?lang=en");
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page.getByRole("tab", { name: "Visit Summary", exact: true }).click();
  await expect(page.locator(".visit-workspace")).toBeVisible();
  for (const width of mobile ? [320, 390, 768] : [1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "tmp/report-qa/visit-" + test.info().project.name + ".png",
    fullPage: true,
  });

  // Review the correction through the actual clinic UI, including the PDF lightbox.
  await page.getByLabel("Recipient email for verification").fill(email);
  await page
    .getByRole("button", { name: "Patient preview and approval", exact: true })
    .click();
  const previewDialog = page.getByRole("dialog", {
    name: "Patient report preview",
  });
  await expect(previewDialog).toBeVisible();
  await expect(
    previewDialog.getByRole("button", {
      name: "Approve version — do not send",
      exact: true,
    }),
  ).toBeDisabled();
  await previewDialog
    .getByRole("button", { name: "Preview PDF", exact: true })
    .click();
  const pdfDialog = page.locator(".document-lightbox");
  await expect(pdfDialog.locator("canvas")).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await expect(previewDialog).toBeVisible();
  await previewDialog.getByRole("checkbox").first().check();
  await previewDialog
    .getByRole("button", { name: "Approve version — do not send", exact: true })
    .click();
  await expect(previewDialog).not.toBeVisible();
  await expect(page.locator(".approved-version")).toBeVisible();
  const approvedState = await read();
  expect(approvedState.current_approval.version_id).toBe(summary.id);
  await page
    .getByRole("button", { name: "Send secure link", exact: true })
    .click();
  const sendDialog = page.getByRole("dialog", { name: "Confirm notification" });
  await expect(
    sendDialog.getByRole("button", {
      name: "Confirm and send link",
      exact: true,
    }),
  ).toBeDisabled();
  await sendDialog.getByRole("checkbox").first().check();
  await sendDialog
    .getByRole("button", { name: "Confirm and send link", exact: true })
    .click();
  await expect(sendDialog).not.toBeVisible();
  // An unchanged approval survives a transient failure, and retries reuse one delivery.
  const retryEmail = "retry-once-" + randomUUID() + "@example.test";
  const retryPreview = await post({
    action: "preview",
    versionId: summary.id,
    language: "en",
    recipient: retryEmail,
  });
  const retryApproval = (
    await post({
      action: "approve",
      versionId: summary.id,
      language: "en",
      recipient: retryEmail,
      previewHash: retryPreview.hash,
      reviewed: true,
      revokeOtherRecipients: true,
    })
  ).approval;
  await post(
    {
      action: "send",
      approvalId: retryApproval.id,
      recipient: retryEmail,
      confirmed: true,
    },
    503,
  );
  const failedState = await read(),
    failedDelivery = failedState.deliveries.find(
      (d: { id: string; approval_id: string; status: string }) =>
        d.approval_id === retryApproval.id,
    );
  expect(failedState.current_approval.id).toBe(retryApproval.id);
  expect(failedDelivery.status).toBe("failed");
  const retried = await post({
    action: "send",
    approvalId: retryApproval.id,
    recipient: retryEmail,
    confirmed: true,
  });
  expect(retried.delivery_id).toBe(failedDelivery.id);
  await post({ action: "delivery_status", deliveryId: retried.delivery_id });
  expect(
    (await read()).deliveries.find(
      (d: { id: string; approval_id: string; status: string }) =>
        d.id === retried.delivery_id,
    ).status,
  ).toBe("delivered");
  // New source files require explicit acknowledgement rather than silent approval.
  await owner.post(card + "/documents", {
    headers,
    multipart: {
      file: {
        name: "referral.pdf",
        mimeType: "application/pdf",
        buffer: fixture("01-cardiology-referral-he.pdf"),
      },
    },
  });
  const stalePreview = await post({
    action: "preview",
    versionId: summary.id,
    language: "en",
    recipient: retryEmail,
  });
  expect(stalePreview.outdated).toBe(true);
  await post(
    {
      action: "approve",
      versionId: summary.id,
      language: "en",
      recipient: retryEmail,
      previewHash: stalePreview.hash,
      reviewed: true,
    },
    409,
  );

  await owner.dispose();
  await patient.dispose();
  await anonymous.dispose();
});

test("secretaries can edit lifestyle drafts but cannot edit, approve or send patient reports", async ({
  playwright,
}) => {
  const origin = "http://127.0.0.1:3100",
    headers = { origin },
    owner = await playwright.request.newContext({
      baseURL: origin,
      storageState: "tmp/owner-auth.json",
    }),
    staff = await playwright.request.newContext({ baseURL: origin });
  const email = "visit-secretary-" + randomUUID() + "@example.test";
  expect(
    (
      await staff.post("/api/clinic/auth", {
        headers,
        data: { action: "request", email },
      })
    ).status(),
  ).toBe(200);
  const box = await (
      await owner.get("http://127.0.0.1:3199/outbox?email=" + email)
    ).json(),
    code = box.at(-1).text.match(/\b\d{6}\b/)[0];
  expect(
    (
      await staff.post("/api/clinic/auth", {
        headers,
        data: { action: "verify", email, code },
      })
    ).status(),
  ).toBe(200);
  const record = (
      await (
        await owner.post("/api/clinic/appointments", {
          headers,
          data: {
            mode: "clinic",
            patientLabel: "Fictional role check " + randomUUID(),
          },
        })
      ).json()
    ).appointment,
    ep = "/api/clinic/appointments/" + record.id + "/visit";
  expect((await staff.get(ep)).status()).toBe(403);
  const users = (await (await owner.get("/api/clinic/users")).json()).users,
    user = users.find((u: { email: string; id: string }) => u.email === email);
  expect(
    (
      await owner.patch("/api/clinic/users", {
        headers,
        data: { id: user.id, status: "active", role: "secretary" },
      })
    ).status(),
  ).toBe(200);
  expect((await staff.get(ep)).status()).toBe(200);
  for (const action of [
    "save_findings",
    "save_summary",
    "generate_summary",
    "preview",
    "approve",
    "send",
    "reissue",
    "revoke",
  ]) {
    expect((await staff.post(ep, { headers, data: { action } })).status()).toBe(
      403,
    );
  }
  const life = {
    sections: [
      {
        id: randomUUID(),
        kind: "other",
        title: bi("Clinician discussion"),
        patient_text: bi("Discuss next steps with your clinician."),
      },
    ],
    limitations: [],
  };
  expect(
    (
      await staff.post(ep, {
        headers,
        data: { action: "save_lifestyle", content: life },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await owner.post(ep, {
        headers: { origin: "https://example.invalid" },
        data: { action: "save_lifestyle", content: life },
      })
    ).status(),
  ).toBe(403);
  await owner.dispose();
  await staff.dispose();
});
