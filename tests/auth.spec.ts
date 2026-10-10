import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3100";
const headers = { origin };
async function codeFor(
  request: import("@playwright/test").APIRequestContext,
  email: string,
) {
  const r = await request.get(
    "http://127.0.0.1:3199/outbox?email=" + encodeURIComponent(email),
  );
  const mail = (await r.json()).at(-1);
  expect(mail.text).toMatch(/\b\d{6}\b/);
  expect(mail.from).toBe("CardioAhead <login@cardioahead.test>");
  expect(mail).not.toHaveProperty("attachments");
  return mail.text.match(/\b\d{6}\b/)[0] as string;
}
test("email OTP is browser-bound, single-use, rate-limited and locks after five failures", async ({
  request,
  playwright,
}) => {
  const email = "otp-" + randomUUID() + "@example.test";
  const send = await request.post("/api/clinic/auth", {
    headers,
    data: { action: "request", email },
  });
  expect(send.status()).toBe(200);
  const cookie = send.headers()["set-cookie"];
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=strict");
  const code = await codeFor(request, email);
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "request", email },
      })
    ).status(),
  ).toBe(429);
  const other = await playwright.request.newContext({ baseURL: origin });
  expect(
    (
      await other.post("/api/clinic/auth", {
        headers,
        data: { action: "verify", email, code },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "verify", email, code },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "verify", email, code },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/clinic/appointments")).status()).toBe(403);
  expect((await request.get("/api/clinic/users")).status()).toBe(403);
  await other.dispose();
  const locked = "locked-" + randomUUID() + "@example.test";
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "request", email: locked },
      })
    ).status(),
  ).toBe(200);
  const correct = await codeFor(request, locked);
  const wrong = correct === "123456" ? "654321" : "123456";
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request.post("/api/clinic/auth", {
          headers,
          data: { action: "verify", email: locked, code: wrong },
        })
      ).status(),
    ).toBe(401);
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "verify", email: locked, code: correct },
      })
    ).status(),
  ).toBe(401);
});
test("sole admin approves staff; staff cannot manage users; suspension ends existing sessions", async ({
  page,
  request,
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  const email = "staff-" + randomUUID() + "@example.test";
  await page.goto("/admin");
  await page.getByLabel("כתובת דוא״ל").fill(email);
  await page.getByRole("button", { name: "שלחו לי קוד כניסה" }).click();
  await expect(page.getByLabel("קוד כניסה בן 6 ספרות")).toBeVisible();
  await page
    .getByLabel("קוד כניסה בן 6 ספרות")
    .fill(await codeFor(request, email));
  await page.getByRole("button", { name: "אימות וכניסה" }).click();
  await expect(
    page.getByRole("heading", { name: "הכתובת אומתה." }),
  ).toBeVisible();
  expect((await page.request.get("/api/clinic/appointments")).status()).toBe(
    403,
  );
  await page
    .context()
    .storageState({ path: "tmp/staff-" + test.info().project.name + ".json" });
  const state = JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8"));
  const ownerContext = await page.context().browser()!.newContext({
    baseURL: origin,
    storageState: state,
    viewport: page.viewportSize()!,
  });
  const admin = await ownerContext.newPage();
  await admin.goto("/admin");
  await admin.getByRole("link", { name: "ניהול משתמשים" }).click();
  await expect(
    admin.getByRole("heading", { name: "צוות המרפאה" }),
  ).toBeVisible();
  const card = admin.locator(".staff-row").filter({ hasText: email });
  await card.getByLabel("הרשאה עבור " + email).selectOption("professor");
  await card.getByRole("button", { name: "אישור גישה", exact: true }).click();
  await expect(card.getByText("גישה מאושרת", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "בדיקת מצב האישור" }).click();
  await expect(page.getByRole("button", { name: "הזמנה חדשה" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ניהול משתמשים" })).toHaveCount(
    0,
  );
  expect((await page.request.get("/api/clinic/users")).status()).toBe(403);
  const users = (await (await owner.get("/api/clinic/users")).json()).users;
  const me = users.find(
    (v: { email: string }) => v.email === "galadv73@gmail.com",
  );
  const staff = users.find((v: { email: string }) => v.email === email);
  expect(
    (
      await owner.patch("/api/clinic/users", {
        headers,
        data: { id: me.id, status: "suspended", role: "secretary" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.patch("/api/clinic/users", {
        headers,
        data: { id: staff.id, status: "active", role: "admin" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.patch("/api/clinic/users", {
        headers,
        data: { id: staff.id, status: "active", role: "professor" },
      })
    ).status(),
  ).toBe(403);
  expect(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await admin.screenshot({
    path: "tmp/staff-management-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await card.getByRole("button", { name: "השהיית גישה", exact: true }).click();
  await expect(admin.getByRole("dialog")).toBeVisible();
  await admin.getByRole("button", { name: "אישור ביטול הגישה" }).click();
  await expect(card.getByText("גישה מושהית", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/clinic/appointments")).status()).toBe(
    401,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "שלחו לי קוד כניסה" }),
  ).toBeVisible();
  await ownerContext.close();
  await owner.dispose();
});
test("invalid emails, cross-origin login and delivery failures do not create access", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "request", email: "not-an-email" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers: { origin: "https://evil.example" },
        data: { action: "request", email: "galadv73@gmail.com" },
      })
    ).status(),
  ).toBe(403);
  const email = "delivery-failure-" + randomUUID() + "@example.test";
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "request", email },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/clinic/auth", {
        headers,
        data: { action: "verify", email, code: "123456" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.get("/api/clinic/users")).status()).toBe(401);
});
