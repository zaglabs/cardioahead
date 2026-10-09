import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
test("English public pages render on the server and language preference survives navigation", async ({
  page,
  request,
}) => {
  const ssr = await request.get("/?lang=en");
  expect(await ssr.text()).toContain('lang="en" dir="ltr"');
  await page.goto("/?lang=en");
  await expect(
    page.getByRole("heading", { name: "Care begins even before your visit." }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/[\u0590-\u05ff]/);
  await page
    .getByRole("link", { name: "Clinic staff sign-in", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.getByLabel("Email address").fill("draft@example.test");
  await page.getByLabel("Choose language").selectOption("he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByLabel("כתובת דוא״ל")).toHaveValue(
    "draft@example.test",
  );
  await page.getByLabel("בחרו שפה").selectOption("en");
  await expect(page.getByLabel("Email address")).toHaveValue(
    "draft@example.test",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const route of ["/privacy", "/test-documents", "/missing-page-test"]) {
    await page.goto(route);
    expect(await page.locator("main").innerText()).not.toMatch(
      /[\u0590-\u05ff]/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await page.screenshot({
    path: "tmp/home-en-" + test.info().project.name + ".png",
    fullPage: true,
  });
});
test("English sign-in sends an English email and retains the verification step when language changes", async ({
  page,
  request,
}) => {
  const email = "english-" + randomUUID() + "@example.test";
  await page.goto("/admin?lang=en");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send me a sign-in code" }).click();
  await expect(page.getByLabel("Six-digit sign-in code")).toBeVisible();
  const inbox = await request.get(
    "http://127.0.0.1:3199/outbox?email=" + encodeURIComponent(email),
  );
  const message = (await inbox.json()).at(-1);
  expect(message.subject).toBe("Your CardioAhead sign-in code");
  expect(message.html).toContain('dir="ltr" lang="en"');
  const code = message.text.match(/\b\d{6}\b/)[0];
  await page.getByLabel("Six-digit sign-in code").fill(code);
  await page.getByLabel("Choose language").selectOption("he");
  await expect(page.getByLabel("קוד כניסה בן 6 ספרות")).toHaveValue(code);
  await page.getByLabel("בחרו שפה").selectOption("en");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Email verified." }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/[\u0590-\u05ff]/);
});
test("English clinic creates English invitation; patient switches language without losing their files", async ({
  page,
  browser,
}) => {
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  await page.goto("/admin?lang=en");
  await expect(
    page.getByRole("link", { name: "User management" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New invitation" }).click();
  const patientLabel = "English test patient " + test.info().project.name;
  await page.getByLabel("Patient name / label").fill(patientLabel);
  await page.getByLabel("Invitation language").selectOption("en");
  await page.getByLabel("Choose language").selectOption("he");
  await expect(page.getByLabel("שם / כינוי המטופל")).toHaveValue(patientLabel);
  await page.getByLabel("בחרו שפה").selectOption("en");
  await page
    .getByRole("button", { name: "Create link and access code" })
    .click();
  const link = await page
    .getByLabel("Personal link", { exact: true })
    .inputValue();
  const code = await page
    .getByLabel("Access code", { exact: true })
    .inputValue();
  expect(new URL(link).searchParams.get("lang")).toBe("en");
  const context = await browser.newContext({
    baseURL: origin,
    viewport: page.viewportSize()!,
  });
  const patient = await context.newPage();
  await patient.goto(link);
  await expect(
    patient.getByRole("heading", {
      name: "Welcome to Prof. Elad Maor’s clinic",
    }),
  ).toBeVisible();
  await expect(patient.locator(".invitation-heart svg")).toBeVisible();
  await expect(
    patient.getByText("Three simple steps", { exact: true }),
  ).toBeVisible();
  await patient.getByText("What should I prepare?", { exact: true }).click();
  await expect(
    patient.getByRole("link", { name: "Download the test documents" }),
  ).toBeVisible();
  await patient.getByText("Need a hand?", { exact: true }).click();
  await expect(
    patient.getByRole("link", { name: "Clinic contact details" }),
  ).toBeVisible();
  expect(await patient.locator("main").innerText()).not.toMatch(
    /[\u0590-\u05ff]/,
  );
  expect(
    await patient.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await patient.screenshot({
    path: "tmp/invitation-en-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await patient.getByLabel("Access code", { exact: true }).fill(code);
  await patient
    .getByRole("button", { name: "Enter your patient area" })
    .click();
  await patient.getByLabel("Select PDF files").setInputFiles([fixture, second]);
  await expect(
    patient.getByText("2 documents saved", { exact: true }),
  ).toBeVisible();
  await patient.getByLabel("Choose language").selectOption("he");
  await expect(
    patient.getByText("2 מסמכים נשמרו", { exact: true }),
  ).toBeVisible();
  await expect(patient.locator(".document-option")).toHaveCount(2);
  await patient.getByLabel("בחרו שפה").selectOption("en");
  await expect(
    patient.getByText("2 documents saved", { exact: true }),
  ).toBeVisible();
  await patient
    .getByRole("button", { name: "Review before submitting" })
    .click();
  await patient.locator('input[type="checkbox"]').check();
  await patient
    .getByRole("button", { name: "Submit to the clinic", exact: true })
    .click();
  await expect(
    patient.getByRole("heading", {
      name: "Your documents have been received.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh appointments" }).click();
  const card = page.locator(".case-card").filter({ hasText: patientLabel });
  await card.click();
  await expect(
    page
      .locator(".case-detail")
      .getByText("Received by clinic", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "User management" }).click();
  await expect(
    page.getByRole("heading", { name: "Clinic staff" }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/[\u0590-\u05ff]/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "tmp/admin-en-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await context.close();
});
test("API errors follow language and invalid language values do not change authorization", async ({
  request,
}) => {
  const english = await request.get("/api/clinic/appointments?lang=en");
  expect(english.status()).toBe(401);
  expect(english.headers()["content-language"]).toBe("en");
  expect((await english.json()).message).toBe(
    "Sign in with your clinic staff account.",
  );
  const hebrew = await request.get("/api/clinic/appointments?lang=he");
  expect(hebrew.status()).toBe(401);
  expect((await hebrew.json()).message).toBe("יש להיכנס עם חשבון צוות המרפאה.");
  const invalid = await request.post("/api/clinic/auth?lang=en", {
    headers,
    data: { action: "request", email: "invalid" },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).message).toBe("Enter a valid email address.");
});
