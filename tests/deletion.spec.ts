import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3100",
  headers = { origin };
const echo = fs.readFileSync(
  path.join(process.cwd(), "public/test-documents/02-echocardiogram-he.pdf"),
);
async function register(
  context: import("@playwright/test").APIRequestContext,
  email: string,
) {
  expect(
    (
      await context.post("/api/clinic/auth", {
        headers,
        data: { action: "request", email },
      })
    ).status(),
  ).toBe(200);
  const outbox = await (
    await context.get(
      "http://127.0.0.1:3199/outbox?email=" + encodeURIComponent(email),
    )
  ).json();
  const code = outbox.at(-1).text.match(/\b\d{6}\b/)[0];
  expect(
    (
      await context.post("/api/clinic/auth", {
        headers,
        data: { action: "verify", email, code },
      })
    ).status(),
  ).toBe(200);
}
test("staff can confirm deleting a card, removing its PDFs, analysis, visual explanation and patient access", async ({
  page,
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  const patient = await playwright.request.newContext({ baseURL: origin });
  const label = "Delete card " + test.info().project.name;
  const created = await (
    await owner.post("/api/clinic/appointments", {
      headers,
      data: { patientLabel: label, language: "en" },
    })
  ).json();
  const id = created.appointment.id,
    endpoint = "/api/clinic/appointments/" + id;
  await patient.post("/api/patient/verify", {
    headers,
    data: {
      token: new URL(created.invitationUrl).pathname.split("/").pop(),
      code: created.code,
    },
  });
  const uploaded = await (
    await patient.post("/api/patient/documents", {
      headers,
      multipart: {
        file: { name: "echo.pdf", mimeType: "application/pdf", buffer: echo },
      },
    })
  ).json();
  await patient.post("/api/patient/submit", {
    headers,
    data: { confirmed: true },
  });
  await expect
    .poll(
      async () =>
        (await (await owner.get(endpoint + "/analysis")).json()).analysis
          ?.status,
      { timeout: 25000 },
    )
    .toBe("ready");
  expect(
    (
      await owner.post(endpoint + "/analysis", {
        headers,
        data: { action: "create_presentation" },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await owner.delete(endpoint, {
        headers,
        data: { confirmed: false, patientLabel: label },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.delete(endpoint, {
        headers: { origin: "https://evil.example" },
        data: { confirmed: true, patientLabel: label },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await patient.delete(endpoint, {
        headers,
        data: { confirmed: true, patientLabel: label },
      })
    ).status(),
  ).toBe(401);
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  await page.goto("/admin?lang=en");
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page
    .getByRole("button", { name: "Delete patient card", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back", exact: true })
    .click();
  expect(
    (await owner.get("/api/clinic/documents/" + uploaded.document.id)).status(),
  ).toBe(200);
  const localRoot = path.resolve(".local-test-data");
  const privatePath = fs
    .readdirSync(localRoot)
    .map((folder) =>
      path.join(localRoot, folder, id, uploaded.document.id + ".pdf"),
    )
    .find((file) => fs.existsSync(file));
  expect(privatePath).toBeTruthy();
  if (
    !privatePath ||
    !path.resolve(privatePath).startsWith(localRoot + path.sep)
  )
    throw new Error("Unsafe test storage path");
  // Use only this test's synthetic file to simulate a cleanup failure.
  const backup = privatePath + ".cleanup-test-backup";
  fs.renameSync(privatePath, backup);
  fs.mkdirSync(privatePath);
  await page
    .getByRole("button", { name: "Delete patient card", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm card deletion", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "card is blocked",
  );
  expect(
    (await owner.get("/api/clinic/documents/" + uploaded.document.id)).status(),
  ).toBe(410);
  expect((await owner.get(endpoint + "/analysis")).status()).toBe(410);
  expect((await patient.get("/api/patient/appointment")).status()).toBe(401);
  fs.rmdirSync(privatePath); // The directory is empty and inside the test's storage root.
  fs.renameSync(backup, privatePath);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete deletion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm card deletion", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.locator(".case-card").filter({ hasText: label }),
  ).toHaveCount(0);
  expect(
    (await owner.get("/api/clinic/documents/" + uploaded.document.id)).status(),
  ).toBe(404);
  expect((await owner.get(endpoint + "/analysis")).status()).toBe(404);
  expect(fs.existsSync(privatePath)).toBe(false);
  expect((await patient.get("/api/patient/appointment")).status()).toBe(401);
  await owner.dispose();
  await patient.dispose();
});
test("admin role grid deletes a user, preserves their cards and protects the sole owner", async ({
  page,
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  const member = await playwright.request.newContext({ baseURL: origin });
  const email = "delete-" + randomUUID() + "@example.test";
  await register(member, email);
  const list = (await (await owner.get("/api/clinic/users")).json()).users;
  const target = list.find((v: { email: string }) => v.email === email),
    admin = list.find(
      (v: { email: string }) => v.email === "galadv73@gmail.com",
    );
  await owner.patch("/api/clinic/users", {
    headers,
    data: { id: target.id, status: "active", role: "professor" },
  });
  const card = await (
    await member.post("/api/clinic/appointments", {
      headers,
      data: {
        mode: "clinic",
        patientLabel: "Retained card " + test.info().project.name,
      },
    })
  ).json();
  expect(
    (
      await owner.delete("/api/clinic/users", {
        headers,
        data: { id: admin.id, email: admin.email, confirmed: true },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await member.delete("/api/clinic/users", {
        headers,
        data: { id: target.id, email, confirmed: true },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.delete("/api/clinic/users", {
        headers,
        data: { id: target.id, email, confirmed: false },
      })
    ).status(),
  ).toBe(400);
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  await page.goto("/admin/users?lang=en");
  await expect(
    page.getByRole("columnheader", { name: "Role", exact: true }),
  ).toBeVisible();
  const row = page.locator(".staff-row").filter({ hasText: email });
  await expect(row.getByRole("combobox")).toHaveValue("professor");
  await page.getByLabel("Search users").fill(email);
  await expect(page.locator(".staff-row")).toHaveCount(1);
  await page.screenshot({
    path: "tmp/staff-grid-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await row.getByRole("button", { name: "Delete user", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm user deletion", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  expect((await member.get("/api/clinic/appointments")).status()).toBe(401);
  const cards = (await (await owner.get("/api/clinic/appointments")).json())
    .appointments;
  expect(cards.some((v: { id: string }) => v.id === card.appointment.id)).toBe(
    true,
  );
  await page.getByLabel("Search users").fill("");
  const ownerRow = page
    .locator(".staff-row")
    .filter({ hasText: "galadv73@gmail.com" });
  await expect(
    ownerRow.getByRole("button", { name: "Delete user", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Choose language").selectOption("he");
  await expect(
    page.getByRole("columnheader", { name: "תפקיד", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const retry = await playwright.request.newContext({ baseURL: origin });
  await register(retry, email);
  expect((await retry.get("/api/clinic/appointments")).status()).toBe(403);
  await retry.dispose();
  await member.dispose();
  await owner.dispose();
});
