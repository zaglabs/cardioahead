import { test, expect } from "@playwright/test";
test("home is RTL, clearly labels the prototype, and fits the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "לפני הפגישה",
  );
  await expect(
    page.getByText("גרסת הדגמה · השירות עדיין אינו מקבל מסמכים רפואיים"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByText("האם אפשר כבר להעלות מסמכים?").click();
  await expect(
    page.getByText("עדיין לא. זו גרסת הדגמה", { exact: false }),
  ).toBeVisible();
});
test("patient demo completes with fixture documents and resets on reload", async ({
  page,
}) => {
  await page.goto("/demo/patient");
  await page.getByRole("button", { name: "ממשיכים למסמכים" }).click();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "לבדיקת ההכנה" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /מכתב הפניה לדוגמה/ }).click();
  await page.getByRole("button", { name: /דו״ח אקו לדוגמה/ }).click();
  await page.getByRole("button", { name: "לבדיקת ההכנה" }).click();
  await expect(page.getByText("ההכנה שלכם מרוכזת.")).toBeVisible();
  await page.getByRole("button", { name: "סיום ההדגמה" }).click();
  await expect(page.getByText("סיימתם את ההדגמה")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "ממשיכים למסמכים" }),
  ).toBeVisible();
});
test("clinic filtering and source navigation work using fictional records", async ({
  page,
}) => {
  await page.goto("/demo/clinic");
  await page.getByRole("button", { name: "מוכן לעיון", exact: true }).click();
  await expect(page.locator(".case-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: /מכתב הפניה לדוגמה · עמוד 1/ })
    .click();
  await expect(page.getByRole("tab", { name: /מסמכים/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByText("אין מסמך רפואי או קובץ להורדה בהדגמה."),
  ).toBeVisible();
  await page.getByRole("button", { name: "הדגמת הזמנה" }).click();
  await expect(page.getByText("יצירת הזמנות אמיתיות טרם זמינה")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("admin and arbitrary invitations expose no authentication or upload form", async ({
  page,
}) => {
  for (const path of ["/admin", "/invite/arbitrary-secret-token"]) {
    await page.goto(path);
    await expect(page.locator("form, input")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "arbitrary-secret-token",
    );
  }
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "עדיין אינה זמינה",
  );
});
test("intake fails closed and security headers are present", async ({
  request,
}) => {
  const intake = await request.post("/api/intake", {
    data: { test: "synthetic-only" },
  });
  expect(intake.status()).toBe(503);
  expect(await intake.json()).toMatchObject({ error: "INTAKE_UNAVAILABLE" });
  expect(intake.headers()["cache-control"]).toBe("no-store");
  const home = await request.get("/");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["referrer-policy"]).toBe("no-referrer");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
});
