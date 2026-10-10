import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const headers = { origin: "http://127.0.0.1:3100" };
test("staff renames a completed card without changing saved clinical records; layout works at narrow and tablet widths", async ({
  page,
  playwright,
}) => {
  test.setTimeout(90000);
  const owner = await playwright.request.newContext({
    baseURL: headers.origin,
    storageState: "tmp/owner-auth.json",
  });
  const label = "Workspace " + test.info().project.name;
  const created = await (
    await owner.post("/api/clinic/appointments", {
      headers,
      data: { patientLabel: label, mode: "clinic" },
    })
  ).json();
  const id = created.appointment.id,
    endpoint = "/api/clinic/appointments/" + id;
  const pdf = fs.readFileSync(
    path.join(process.cwd(), "public/test-documents/02-echocardiogram-he.pdf"),
  );
  expect(
    (
      await owner.post(endpoint + "/documents", {
        headers,
        multipart: {
          file: { name: "echo.pdf", mimeType: "application/pdf", buffer: pdf },
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await owner.post(endpoint + "/submit", {
        headers,
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(200);
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
  const saved = await (await owner.get(endpoint + "/analysis")).json();
  const rename = (patientLabel: string, previousLabel = label) => ({
    action: "rename",
    patientLabel,
    previousLabel,
  });
  const anon = await playwright.request.newContext({ baseURL: headers.origin });
  expect(
    (
      await anon.patch(endpoint, { headers, data: rename("No access") })
    ).status(),
  ).toBe(401);
  expect(
    (
      await owner.patch(endpoint, {
        headers: { origin: "https://other.test" },
        data: rename("Wrong origin"),
      })
    ).status(),
  ).toBe(403);
  expect(
    (await owner.patch(endpoint, { headers, data: rename("   ") })).status(),
  ).toBe(400);
  expect(
    (
      await owner.patch(endpoint, { headers, data: rename("a".repeat(101)) })
    ).status(),
  ).toBe(400);
  expect(
    (
      await owner.patch(endpoint, {
        headers,
        data: rename("changed", "Outdated name"),
      })
    ).status(),
  ).toBe(409);
  await page
    .context()
    .addCookies(
      JSON.parse(fs.readFileSync("tmp/owner-auth.json", "utf8")).cookies,
    );
  await page.goto("/admin?lang=en");
  await page.locator(".case-card").filter({ hasText: label }).click();
  await page.getByRole("button", { name: "Edit name", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit patient name" });
  const input = dialog.getByRole("textbox");
  await expect(input).toBeFocused();
  await input.fill("Renamed patient " + test.info().project.name);
  const newName = await input.inputValue();
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".patient-name-heading h2")).toHaveText(newName);
  await expect(
    page.getByRole("status").filter({ hasText: "Patient name updated." }),
  ).toBeVisible();
  expect(
    (
      await owner.patch(endpoint, { headers, data: rename("stale edit") })
    ).status(),
  ).toBe(409);
  const retained = await (await owner.get(endpoint + "/analysis")).json();
  expect(retained.analysis).toEqual(saved.analysis);
  expect(retained.presentation.id).toBe(saved.presentation.id);

  await page.reload();
  await page.locator(".case-card").filter({ hasText: newName }).click();
  await expect(page.locator(".patient-name-heading h2")).toHaveText(newName);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 920 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if (width < 801) {
      const toggle = page.getByRole("button", { name: /Patient cards/ });
      await expect(toggle).toBeVisible();
      if ((await toggle.getAttribute("aria-expanded")) === "true")
        await toggle.click();
      await expect(
        page.getByRole("textbox", { name: "Search patients" }),
      ).not.toBeVisible();
      await toggle.click();
      await page
        .getByRole("textbox", { name: "Search patients" })
        .fill(newName.toUpperCase());
      await page.locator(".case-card").filter({ hasText: newName }).click();
    }
    await page.screenshot({
      path: "tmp/workspace-" + test.info().project.name + "-" + width + ".png",
      fullPage: true,
    });
  }
  await page.goto("/admin?lang=he");
  await expect(
    page.getByRole("button", { name: "עריכת שם", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).toContain("user-scalable=no");
  await owner.dispose();
  await anon.dispose();
});
