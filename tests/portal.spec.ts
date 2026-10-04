import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const origin = "http://127.0.0.1:3100";
const headers = { origin };
const fixture = path.join(
  process.cwd(),
  "public/test-documents/01-cardiology-referral-he.pdf",
);
const second = path.join(
  process.cwd(),
  "public/test-documents/02-echocardiogram-he.pdf",
);
const email = "tester@cardioahead.local";
const code = "local-e2e-password-only";
async function staffLogin(request: APIRequestContext) {
  const response = await request.post("/api/clinic/auth", {
    headers,
    data: { action: "verify", email, code },
  });
  expect(response.status()).toBe(200);
}
async function invitation(
  request: APIRequestContext,
  label = "מטופל בדיקה 001",
) {
  await staffLogin(request);
  const response = await request.post("/api/clinic/appointments", {
    headers,
    data: { patientLabel: label },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{
    appointment: { id: string };
    invitationUrl: string;
    code: string;
  }>;
}
async function verify(
  request: APIRequestContext,
  invite: { invitationUrl: string; code: string },
) {
  return request.post("/api/patient/verify", {
    headers,
    data: { token: invite.invitationUrl.split("/").pop(), code: invite.code },
  });
}
test("Hebrew public site has no demo banner and stays readable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("body")).not.toContainText("גרסת הדגמה");
  await expect(page.locator('a[href="/demo/patient"]')).toHaveCount(0);
  await page.getByText("איך מעלים את המסמכים?", { exact: true }).click();
  await expect(
    page.getByText("בשלב הבדיקות אפשר להעלות", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/test-documents");
  await expect(page.locator("a[download]")).toHaveCount(3);
});
test("clinic creates an invitation; patient uploads two PDFs; clinic retrieves identical bytes", async ({
  page,
  browser,
}) => {
  await page.goto("/admin");
  await page.getByLabel("סיסמת סביבת הבדיקה המקומית").fill(code);
  await page.getByRole("button", { name: "כניסה למרפאה", exact: true }).click();
  await page.getByRole("button", { name: "הזמנה חדשה" }).click();
  const label = "מטופל בדיקה " + test.info().project.name;
  await page.getByLabel("שם / כינוי המטופל").fill(label);
  await page.getByRole("button", { name: "יצירת קישור וקוד גישה" }).click();
  const url = await page.getByLabel("קישור אישי", { exact: true }).inputValue();
  const pin = await page.getByLabel("קוד גישה", { exact: true }).inputValue();
  const patientContext = await browser.newContext({
    viewport: page.viewportSize()!,
    baseURL: origin,
  });
  const patient = await patientContext.newPage();
  await patient.goto(url);
  await patient.getByLabel("קוד גישה", { exact: true }).fill(pin);
  await patient.getByRole("button", { name: "כניסה למרחב האישי" }).click();
  await patient.getByLabel("בחירת קובצי PDF").setInputFiles([fixture, second]);
  await expect(patient.getByText("2 מסמכים נשמרו")).toBeVisible();
  expect(
    await patient.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await patient.getByRole("button", { name: "בדיקה לפני שליחה" }).click();
  await expect(
    patient.getByRole("button", { name: "שליחה למרפאה", exact: true }),
  ).toBeDisabled();
  await patient.locator('input[type="checkbox"]').check();
  await patient
    .getByRole("button", { name: "שליחה למרפאה", exact: true })
    .click();
  await expect(
    patient.getByText("המסמכים התקבלו.", { exact: true }),
  ).toBeVisible();
  await patient.reload();
  await patient.getByLabel("קוד גישה", { exact: true }).fill(pin);
  await patient.getByRole("button", { name: "כניסה למרחב האישי" }).click();
  await expect(
    patient.getByText("המסמכים התקבלו.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "רענון הביקורים" }).click();
  await expect(
    page.locator(".case-detail").getByText(label, { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".case-detail").getByText("התקבל במרפאה", { exact: true }),
  ).toBeVisible();
  const fileLink = page
    .locator(".document-preview-row")
    .filter({ hasText: "01-cardiology-referral-he.pdf" });
  await expect(fileLink).toBeVisible();
  const documentUrl = await fileLink.getAttribute("href");
  const response = await page.request.get(documentUrl!);
  expect(response.status()).toBe(200);
  expect(
    createHash("sha256")
      .update(await response.body())
      .digest("hex"),
  ).toBe(createHash("sha256").update(fs.readFileSync(fixture)).digest("hex"));
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.getByRole("button", { name: "סימון כנבדק" }).click();
  await expect(
    page.locator(".case-detail").getByText("נבדק", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await patientContext.close();
});
test("unauthenticated users cannot list visits, upload or read documents", async ({
  request,
}) => {
  expect((await request.get("/api/clinic/appointments")).status()).toBe(401);
  expect(
    (
      await request.get(
        "/api/clinic/documents/00000000-0000-4000-8000-000000000099",
      )
    ).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/patient/documents", { headers })).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/intake", { headers, data: {} })).status(),
  ).toBe(401);
});
test("PIN failures persist, lock after five attempts, and expire/revoke access", async ({
  request,
}) => {
  const invite = await invitation(request, "מטופל נעילה");
  const token = invite.invitationUrl.split("/").pop();
  const wrong = invite.code === "111111" ? "222222" : "111111";
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request.post("/api/patient/verify", {
          headers,
          data: { token, code: wrong },
        })
      ).status(),
    ).toBe(401);
  expect((await verify(request, invite)).status()).toBe(401);
  const fresh = await invitation(request, "מטופל ביטול");
  expect((await verify(request, fresh)).status()).toBe(200);
  expect(
    (await request.delete("/api/patient/appointment", { headers })).status(),
  ).toBe(200);
  expect((await request.get("/api/patient/appointment")).status()).toBe(401);
  expect((await verify(request, fresh)).status()).toBe(200);
  expect(
    (
      await request.patch("/api/clinic/appointments/" + fresh.appointment.id, {
        headers,
        data: { action: "revoke" },
      })
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/patient/appointment")).status()).toBe(401);
  expect((await verify(request, fresh)).status()).toBe(401);
});
test("uploads reject unknown PDFs, duplicates, cross-origin writes and cross-patient documents", async ({
  request,
  playwright,
}) => {
  const first = await invitation(request, "תיק ראשון");
  expect((await verify(request, first)).status()).toBe(200);
  const rejected = await request.post("/api/patient/documents", {
    headers,
    multipart: {
      file: {
        name: "unreviewed.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-unknown"),
      },
    },
  });
  expect(rejected.status()).toBe(400);
  expect(
    (
      await request.post("/api/patient/documents", {
        headers: { origin: "https://other.example" },
        multipart: {
          file: {
            name: "test.pdf",
            mimeType: "application/pdf",
            buffer: fs.readFileSync(fixture),
          },
        },
      })
    ).status(),
  ).toBe(403);
  const uploaded = await request.post("/api/patient/documents", {
    headers,
    multipart: {
      file: {
        name: "source.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(fixture),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const doc = (await uploaded.json()).document;
  expect(
    (
      await request.post("/api/patient/documents", {
        headers,
        multipart: {
          file: {
            name: "again.pdf",
            mimeType: "application/pdf",
            buffer: fs.readFileSync(fixture),
          },
        },
      })
    ).status(),
  ).toBe(409);
  const fresh = await invitation(request, "תיק שני");
  const other = await playwright.request.newContext({ baseURL: origin });
  expect((await verify(other, fresh)).status()).toBe(200);
  const patientRecord = await other.get("/api/patient/appointment");
  expect((await patientRecord.json()).appointment.documents).toHaveLength(0);
  expect((await other.get("/api/clinic/documents/" + doc.id)).status()).toBe(
    401,
  );
  expect(
    (
      await other.post("/api/patient/submit", {
        headers,
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post("/api/patient/submit", {
        headers,
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/patient/documents", {
        headers,
        multipart: {
          file: {
            name: "more.pdf",
            mimeType: "application/pdf",
            buffer: fs.readFileSync(second),
          },
        },
      })
    ).status(),
  ).toBe(409);
  await request.post("/api/clinic/auth", {
    headers,
    data: { action: "logout" },
  });
  expect((await request.get("/api/clinic/documents/" + doc.id)).status()).toBe(
    401,
  );
  await other.dispose();
});
test("hosted builds cannot enable local test access", async ({
  playwright,
}) => {
  const hosted = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3110",
  });
  const response = await hosted.post("/api/clinic/auth", {
    headers: { origin: "http://127.0.0.1:3110" },
    data: { action: "verify", email, code },
  });
  expect(response.status()).toBe(503);
  await hosted.dispose();
});
test("security headers and invalid invitations expose no clinical data", async ({
  request,
  page,
}) => {
  const home = await request.get("/");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["referrer-policy"]).toBe("no-referrer");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  const bad = await request.post("/api/patient/verify", {
    headers,
    data: { token: "not-valid", code: "123456" },
  });
  expect(bad.status()).toBe(401);
  await page.goto("/demo/clinic");
  await expect(page).toHaveURL(/\/admin$/);
});
