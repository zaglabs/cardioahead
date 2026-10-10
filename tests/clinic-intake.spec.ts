import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const origin = "http://127.0.0.1:3100",
  headers = { origin };
const files = ["01-cardiology-referral-he.pdf", "02-echocardiogram-he.pdf"].map(
  (name) => ({
    name,
    bytes: Array.from(
      fs.readFileSync(path.join(process.cwd(), "public/test-documents", name)),
    ),
  }),
);
test("clinic manually creates a private card, drops PDFs, previews in place and prepares reusable clinical records", async ({
  page,
  playwright,
}) => {
  test.setTimeout(90000);
  const owner = await playwright.request.newContext({
    baseURL: origin,
    storageState: "tmp/owner-auth.json",
  });
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  await page.goto("/admin?lang=en");
  await page.getByRole("button", { name: "New patient card" }).click();
  await page
    .getByLabel("Patient name / label")
    .fill("Manual clinic " + test.info().project.name);
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/clinic/appointments") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create card", exact: true }).click();
  const result = await (await created).json(),
    id = result.appointment.id;
  expect(result.appointment.intake_mode).toBe("clinic");
  expect(result).not.toHaveProperty("invitationUrl");
  expect(result).not.toHaveProperty("code");
  await expect(
    page.getByRole("heading", {
      name: "Manual clinic " + test.info().project.name,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke access link" }),
  ).toHaveCount(0);
  const transfer = await page.evaluateHandle((files) => {
    const data = new DataTransfer();
    for (const file of files)
      data.items.add(
        new File([new Uint8Array(file.bytes)], file.name, {
          type: "application/pdf",
        }),
      );
    return data;
  }, files);
  await page
    .locator(".document-dropzone")
    .dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator(".document-dropzone")).toHaveClass(/dragging/);
  await page
    .locator(".document-dropzone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".document-preview-row")).toHaveCount(2);
  const pageUrl = page.url(),
    pages = page.context().pages().length;
  await page.locator(".document-preview-row").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect
    .poll(
      () =>
        dialog.locator("canvas").evaluate((canvas) => {
          const c = canvas as HTMLCanvasElement,
            ctx = c.getContext("2d");
          if (!ctx || !c.width || !c.height) return 0;
          const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
          let dark = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i] < 100 && pixels[i + 3] > 0) dark++;
          return dark;
        }),
      { timeout: 20000 },
    )
    .toBeGreaterThan(500);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByText("125%", { exact: true })).toBeVisible();
  expect(page.url()).toBe(pageUrl);
  expect(page.context().pages()).toHaveLength(pages);
  await page.screenshot({
    path: "tmp/clinic-document-lightbox-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".document-preview-row").first()).toBeFocused();
  await page.locator(".document-preview-row").last().click();
  await expect(dialog.locator("canvas")).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Close document", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const duplicate = await owner.post(
    "/api/clinic/appointments/" + id + "/documents",
    {
      headers,
      multipart: {
        file: {
          name: files[0].name,
          mimeType: "application/pdf",
          buffer: Buffer.from(files[0].bytes),
        },
      },
    },
  );
  expect(duplicate.status()).toBe(409);
  const unknown = await owner.post(
    "/api/clinic/appointments/" + id + "/documents",
    {
      headers,
      multipart: {
        file: {
          name: "unreviewed.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4 unreviewed"),
        },
      },
    },
  );
  expect(unknown.status()).toBe(400);
  expect((await unknown.json()).error).toBe("TEST_DOCUMENT_ONLY");
  await page
    .getByLabel(
      "I checked that the documents belong to this test case and approve processing through the approved AI service.",
    )
    .check();
  await page
    .getByRole("button", { name: "Prepare pre-visit summary", exact: true })
    .click();
  await expect(
    page.getByText("AI draft for clinician review", { exact: true }),
  ).toBeVisible({ timeout: 25000 });
  const endpoint = "/api/clinic/appointments/" + id + "/analysis";
  const ready = await (await owner.get(endpoint)).json();
  expect(ready.analysis.status).toBe("ready");
  expect(ready.presentation).toBeNull();
  await page.locator(".source-evidence summary").first().click();
  await page.locator(".source-evidence a").first().click();
  await expect(dialog.locator("canvas")).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Close document", exact: true })
    .click();
  await page.getByRole("tab", { name: "Visual Explanation" }).click();
  await expect(
    page.getByRole("button", {
      name: "Create Visual Explanation",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create Visual Explanation", exact: true })
    .click();
  await expect(page.locator(".presentation-viewer")).toBeVisible();
  const saved = (await (await owner.get(endpoint)).json()).presentation;
  expect(saved.id).toBeTruthy();
  await page.locator(".presentation-evidence a").first().click();
  await expect(dialog.locator("canvas")).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Close document", exact: true })
    .click();
  const locked = await owner.post(
    "/api/clinic/appointments/" + id + "/documents",
    {
      headers,
      multipart: {
        file: {
          name: files[0].name,
          mimeType: "application/pdf",
          buffer: Buffer.from(files[0].bytes),
        },
      },
    },
  );
  expect(locked.status()).toBe(409);
  const repeated = await owner.post(endpoint, {
    headers,
    data: { action: "create_presentation" },
  });
  expect((await repeated.json()).presentation.id).toBe(saved.id);
  const outsider = await playwright.request.newContext({ baseURL: origin });
  expect(
    (
      await outsider.post("/api/clinic/appointments/" + id + "/documents", {
        headers,
        multipart: {
          file: {
            name: files[0].name,
            mimeType: "application/pdf",
            buffer: Buffer.from(files[0].bytes),
          },
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await owner.post("/api/clinic/appointments/" + id + "/submit", {
        headers: { origin: "https://evil.example" },
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(403);
  await page.getByLabel("Choose language").selectOption("he");
  await page.getByRole("tab", { name: "מסמכים (2)" }).click();
  await page.locator(".document-preview-row").first().click();
  await expect(page.getByRole("button", { name: "סגירת המסמך" })).toBeVisible();
  await expect(dialog.locator("canvas")).toBeVisible({ timeout: 20000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await outsider.dispose();
  await owner.dispose();
});
