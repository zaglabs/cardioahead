import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClalitCollector } from "../scripts/clalit-collector-runtime.mjs";
import {
  collectorState,
  collectedCounts,
} from "../scripts/clalit-import-state.mjs";
test("guided collector page does not claim a successful connection or import before supported records are read", async () => {
  const original = globalThis.fetch,
    token = "a".repeat(48);
  let packet = null,
    status = "awaiting_collection",
    calls = 0;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(
      url,
      "https://www.cardioahead.com/api/clinic/medical-imports/upload",
    );
    calls++;
    if (options.method === "POST") {
      packet = JSON.parse(options.body);
      status = "ready";
      return new Response(JSON.stringify({ queued: true }), { status: 202 });
    }
    return new Response(
      JSON.stringify({
        provider: "clalit",
        subject_scope: "self",
        patient_label: "Fictional patient",
        claude_consent: true,
        status,
        origin_kind: "patient",
      }),
    );
  };
  let app, browser;
  try {
    app = await createClalitCollector({
      launchOptions: { headless: true },
      port: 3186,
    });
    // Install only synthetic responses; no real provider login or records are touched.
    app.handlers.openClalit = async () => {
      collectorState().workflow = { stage: "signin" };
    };
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(
      "http://127.0.0.1:3186/connect#token=" + token + "&lang=en",
    );
    await assert.doesNotReject(() =>
      page
        .getByText("Patient card: Fictional patient")
        .waitFor({ timeout: 5000 }),
    );
    await page
      .getByRole("button", { name: "1. Open Clalit and sign in" })
      .click();
    // A fresh unauthenticated Clalit page must not mark an import or connection completed.
    await page.locator("#own").check();
    await page
      .getByRole("button", { name: "2. I signed in — collect records" })
      .click();
    await page.waitForTimeout(300);
    assert.equal(packet, null);
    assert.equal(collectedCounts().record_count, 0);
    assert.ok(calls > 0);
    assert.equal(collectorState().import_status.status, "awaiting_collection");
  } finally {
    await browser?.close();
    await app?.close();
    globalThis.fetch = original;
  }
});

test("guided sign-in, collection, source review and transfer complete using fictional provider pages", async () => {
  const original = globalThis.fetch,
    token = "b".repeat(48);
  let packet = null,
    status = "awaiting_collection",
    app,
    viewer;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(
      url,
      "https://www.cardioahead.com/api/clinic/medical-imports/upload",
    );
    if (options.method === "POST") {
      packet = JSON.parse(options.body);
      status = "ready";
      return new Response(
        JSON.stringify({ queued: true, original_documents_saved: false }),
        { status: 202 },
      );
    }
    return new Response(
      JSON.stringify({
        provider: "clalit",
        subject_scope: "self",
        patient_label: "Fictional patient",
        claude_consent: true,
        status,
        origin_kind: "patient",
      }),
    );
  };
  const body =
    '<nav><a href="javascript:void(0)">תיק רפואי אישי</a><button type="button" onclick="document.querySelector(\'main\').innerHTML=document.querySelector(\'template\').innerHTML">בדיקות מעבדה</button><button type="button">יציאה</button></nav><main></main><template><table><thead><tr><th>תאריך בדיקה</th><th>מספר בדיקה</th><th>תוצאות בדיקה</th></tr></thead><tbody><tr><td>01.01.2026</td><td>11111111</td><td><a href="#detail" onclick="document.getElementById(\'values\').hidden=false">הצגה</a></td></tr></tbody></table><div id="values" hidden><p>מספר הבדיקה: 11111111</p><p>תאריך הבדיקה: 01.01.2026</p><table><thead><tr><th>שם הבדיקה</th><th>תוצאה</th></tr></thead><tbody><tr><td>FICTIONAL_ALPHA</td><td>7.3 mg/dL</td></tr></tbody></table></div></template>';
  const fixtureBrowser = {
    async launch(options) {
      const browser = await chromium.launch(options),
        newContext = browser.newContext.bind(browser);
      browser.newContext = async (settings) => {
        const context = await newContext(settings);
        await context.route("https://e-services.clalit.co.il/**", (route) =>
          route.fulfill({ contentType: "text/html;charset=utf-8", body }),
        );
        return context;
      };
      return browser;
    },
  };
  try {
    app = await createClalitCollector({
      launchOptions: { headless: true },
      port: 3187,
      browserType: fixtureBrowser,
    });
    viewer = await chromium.launch({ headless: true });
    const page = await viewer.newPage();
    await page.goto(
      "http://127.0.0.1:3187/connect#token=" + token + "&lang=en",
    );
    await page.getByText("Patient card: Fictional patient").waitFor();
    await page
      .getByRole("button", { name: "1. Open Clalit and sign in" })
      .click();
    await page.locator("#own").check();
    await page
      .getByRole("button", { name: "2. I signed in — collect records" })
      .click();
    await page.getByText(/1 sources \/ 1 entries/).waitFor({ timeout: 15000 });
    assert.equal(packet, null, "Collecting alone does not upload records");
    await page
      .getByRole("button", { name: "Import selected records to the clinic" })
      .click();
    await page.getByText(/Import complete/).waitFor({ timeout: 10000 });
    assert.equal(packet.records.length, 1);
    assert.match(packet.records[0].entries[0].text, /7\.3 mg\/dL/);
    assert.equal(packet.records[0].association_verified, true);
    assert.equal(collectedCounts().record_count, 0);
    assert.equal(new URL(page.url()).hash, "");
  } finally {
    await viewer?.close();
    await app?.close();
    globalThis.fetch = original;
  }
});
