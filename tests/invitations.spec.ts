import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3120",
  headers = { origin };
const rid = "99999999-9999-4999-8999-999999999991";
const data = {
  schema_version: 1,
  provider: "clalit",
  subject_scope: "self",
  collected_at: "2026-01-01T00:00:00Z",
  coverage: [{ category: "laboratory", status: "partial", record_count: 1 }],
  records: [
    {
      id: rid,
      category: "laboratory",
      title: "Fictional invitation laboratory",
      record_date: "01.01.2026",
      provider_reference: "FICTIONAL-INV-LAB",
      source_origin: "https://e-services.clalit.co.il",
      source_path: "/fictional-laboratory",
      association_verified: true,
      entries: [
        { id: "entry_1", text: "FICTIONAL_ALPHA: 7.3 mg/dL" },
        { id: "entry_2", text: "UNREFERENCED_FICTIONAL_VALUE: 1.25" },
      ],
    },
  ],
};
test("invitation choices, consented Clalit import, truthful tracking and staff lifecycle work on desktop and mobile", async ({
  page,
  playwright,
}) => {
  test.setTimeout(120000);
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/claude-owner-auth.json",
  });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  const label =
    "Invitation fixture " +
    test.info().project.name +
    " " +
    randomUUID().slice(0, 6);
  const created = await owner.post("/api/clinic/appointments", {
    headers,
    data: { patientLabel: label, language: "en" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const invitation = await created.json(),
    token = new URL(invitation.invitationUrl).pathname.split("/").at(-1)!;
  async function row() {
    return (
      await (
        await owner.get(
          "/api/clinic/invitations?search=" + encodeURIComponent(label),
        )
      ).json()
    ).items[0];
  }
  let tracked = await row();
  expect(tracked.patient_upload_count).toBe(0);
  expect(tracked.first_verified_at).toBeNull();
  expect(tracked.clalit_connected_at).toBeNull();
  expect(tracked.import_status).toBe("not_started");
  expect(JSON.stringify(tracked)).not.toContain(token);
  expect(tracked).not.toHaveProperty("secret_ciphertext");
  expect((await anonymous.get("/api/clinic/invitations")).status()).toBe(401);
  await page.goto(invitation.invitationUrl);
  await expect(
    page.getByText("Import from Clalit", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Boolean((await row()).first_viewed_at))
    .toBe(true);
  expect((await row()).first_verified_at).toBeNull();
  await page.getByLabel("Access code", { exact: true }).fill(invitation.code);
  await page.getByRole("button", { name: "Enter your patient area" }).click();
  await expect(
    page.getByRole("button", { name: /Upload Documents/ }),
  ).toBeVisible();
  await page.screenshot({path:"tmp/invitation-options-"+test.info().project.name+".png",fullPage:true});
  await page.getByRole("button", { name: /Import from Clalit/ }).click();
  await expect(
    page.getByRole("button", { name: "Open Clalit connection" }),
  ).toBeDisabled();
  await expect(
    page.getByText("This pilot needs a Windows computer with Chrome", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({path:"tmp/invitation-clalit-guide-"+test.info().project.name+".png",fullPage:true});
  expect((await row()).clalit_connected_at).toBeNull();
  const patient = await playwright.request.newContext({
    baseURL: origin,
    storageState: await page.context().storageState(),
  });
  expect(
    (
      await patient.post("/api/patient/clalit", {
        headers,
        data: {
          action: "connect",
          appointment_id: invitation.appointment.id,
          own_account: true,
          claude_consent: false,
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await patient.post("/api/patient/clalit", {
        headers,
        data: {
          action: "connect",
          appointment_id: randomUUID(),
          own_account: true,
          claude_consent: true,
        },
      })
    ).status(),
  ).toBe(409);
  const grant = await patient.post("/api/patient/clalit", {
    headers,
    data: {
      action: "connect",
      appointment_id: invitation.appointment.id,
      own_account: true,
      claude_consent: true,
      language: "en",
    },
  });
  expect(grant.status(), await grant.text()).toBe(201);
  const grantToken = new URLSearchParams(
    new URL((await grant.json()).connect_url).hash.slice(1),
  ).get("token")!;
  expect((await row()).clalit_connected_at).toBeNull();
  expect((await row()).latest_import_at).toBeNull();
  const capability = { authorization: "Bearer " + grantToken };
  expect(
    (
      await anonymous.post("/api/clinic/medical-imports/upload", {
        headers: capability,
        data: { ...data, subject_scope: "family" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await anonymous.post("/api/clinic/medical-imports/upload", {
        headers: capability,
        data: {
          ...data,
          records: data.records.map((record) => ({
            ...record,
            association_verified: false,
          })),
        },
      })
    ).status(),
  ).toBe(400);
  const uploaded = await anonymous.post("/api/clinic/medical-imports/upload", {
    headers: capability,
    data,
  });
  expect(uploaded.status(), await uploaded.text()).toBe(202);
  await expect
    .poll(async () => (await row()).import_status, { timeout: 30000 })
    .toBe("ready");
  tracked = await row();
  expect(tracked.clalit_connected_at).not.toBeNull();
  expect(tracked.latest_import_at).not.toBeNull();
  expect(tracked.import_record_count).toBe(1);
  expect(tracked.patient_upload_count).toBe(0);
  const receipt = await patient.get(
    "/api/patient/clalit?appointment=" + invitation.appointment.id,
  );
  const safe = await receipt.json();
  expect(safe.status).toBe("ready");
  expect(safe).not.toHaveProperty("summary");
  expect(JSON.stringify(safe)).not.toContain("7.3");
  await expect(
    page.getByRole("heading", {
      name: "Your Clalit information reached the clinic",
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Finish preparation" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your Clalit information was received.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "tmp/invitation-patient-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/claude-owner-auth.json", "utf8")).cookies,
    );
  await page.goto(origin + "/admin/invitations?lang=en");
  await page.getByLabel("Search patient or issuer").fill(label);
  await expect(
    page.getByRole("table").getByText(label, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Import complete", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show link & code", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByLabel("Access code", { exact: true }),
  ).toHaveValue(invitation.code);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({
    path: "tmp/invitation-staff-" + test.info().project.name + ".png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  const id = tracked.id;
  const extended = await owner.post("/api/clinic/invitations/" + id, {
    headers,
    data: {
      action: "extend",
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
  });
  expect(extended.status(), await extended.text()).toBe(200);
  const email = "invitation-" + randomUUID() + "@example.test",
    request_id = randomUUID();
  const resend = () =>
    owner.post("/api/clinic/invitations/" + id, {
      headers,
      data: { action: "resend", request_id, email, confirmedRecipient: true },
    });
  expect((await resend()).status()).toBe(200);
  expect((await (await resend()).json()).reused).toBe(true);
  const outbox = await (
    await owner.get(
      "http://127.0.0.1:3199/outbox?email=" + encodeURIComponent(email),
    )
  ).json();
  expect(outbox).toHaveLength(1);
  expect(outbox[0].text).toContain(invitation.code);
  expect(outbox[0].text).not.toContain("7.3");
  expect((await row()).last_sent_at).not.toBeNull();
  expect(
    (
      await owner.post("/api/clinic/invitations/" + id, {
        headers,
        data: { action: "revoke", confirmed: true, patientLabel: label },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await patient.get(
        "/api/patient/clalit?appointment=" + invitation.appointment.id,
      )
    ).status(),
  ).toBe(401);
  expect(
    (
      await anonymous.post("/api/clinic/medical-imports/upload", {
        headers: capability,
        data,
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await owner.post("/api/clinic/invitations/" + id, {
        headers,
        data: { action: "delete", confirmed: true, patientLabel: label },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await (await owner.get("/api/clinic/appointments")).json()
    ).appointments.some(
      (a: { id: string }) => a.id === invitation.appointment.id,
    ),
  ).toBe(true);
  const deleted = (
    await (
      await owner.get(
        "/api/clinic/invitations?search=" +
          encodeURIComponent(label) +
          "&deleted=true",
      )
    ).json()
  ).items[0];
  expect(deleted.status).toBe("deleted");
  await patient.dispose();
  await anonymous.dispose();
  await owner.dispose();
});
test("manual uploads are counted only after a file is saved and source methods cannot be silently mixed", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/claude-owner-auth.json",
  });
  const patient = await playwright.request.newContext({ baseURL: origin });
  const created = await (
    await owner.post("/api/clinic/appointments", {
      headers,
      data: { patientLabel: "Upload invitation " + randomUUID() },
    })
  ).json();
  const token = new URL(created.invitationUrl).pathname.split("/").at(-1)!;
  expect(
    (
      await patient.post("/api/patient/verify", {
        headers,
        data: { token, code: created.code },
      })
    ).status(),
  ).toBe(200);
  const file = fs.readFileSync(
    path.join(
      process.cwd(),
      "public/test-documents/01-cardiology-referral-he.pdf",
    ),
  );
  expect(
    (
      await patient.post("/api/patient/documents", {
        headers,
        multipart: {
          appointment_id: created.appointment.id,
          file: {
            name: "fixture.pdf",
            mimeType: "application/pdf",
            buffer: file,
          },
        },
      })
    ).status(),
  ).toBe(201);
  const rows = (
    await (
      await owner.get(
        "/api/clinic/invitations?search=" +
          encodeURIComponent(created.appointment.patient_label),
      )
    ).json()
  ).items;
  expect(rows[0].patient_upload_count).toBe(1);
  expect(rows[0].latest_upload_at).not.toBeNull();
  expect(rows[0].clalit_connected_at).toBeNull();
  expect(
    (
      await patient.post("/api/patient/clalit", {
        headers,
        data: {
          action: "connect",
          appointment_id: created.appointment.id,
          own_account: true,
          claude_consent: true,
        },
      })
    ).status(),
  ).toBe(409);
  await owner.dispose();
  await patient.dispose();
});
