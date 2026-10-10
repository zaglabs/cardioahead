import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import {
  collectMedicalCategories,
  collectCategoryTables,
  inspectMedicalMenus,
  isTrustedClalit,
} from "../scripts/clalit-navigation.mjs";
import { inspectLabStructure } from "../scripts/clalit-structure.mjs";
test("menu collection stays in the verified record page, ignores requests and reports incomplete coverage without medical values", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route("https://e-services.clalit.co.il/**", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<nav>
    <a href="javascript:void(0)">תיק רפואי אישי</a>
    <button type="button" onclick="document.querySelector('main').innerHTML=document.querySelector('template').innerHTML">בדיקות מעבדה</button>
    <button type="button" onclick="window.unsafeAction=true">שליחת בקשה לרופא</button>
    <a href="https://evil.invalid/records">סיכומי אשפוז</a>
    <form><button>תרופות</button></form></nav>
    <h3>תיק רפואי אישי</h3><a href="https://evil.invalid/labs">בדיקות מעבדה</a><main></main><template><table><thead><tr><th>שם הבדיקה</th><th>תוצאה</th></tr></thead><tbody><tr><td>FICTIONAL_ONLY</td><td>7.3</td></tr></tbody></table></template>`,
      }),
    );
    const recordPage = await context.newPage();
    await recordPage.goto("https://e-services.clalit.co.il/fictional-test");
    const otherPage = await context.newPage();
    await otherPage.goto("https://e-services.clalit.co.il/fictional-other");
    await otherPage.setContent(
      "<table><thead><tr><th>שם הבדיקה</th><th>תוצאה</th></tr></thead><tbody><tr><td>UNSELECTED_RECORD</td><td>12345</td></tr></tbody></table>",
    );
    const inventory = await inspectMedicalMenus(context, inspectLabStructure);
    assert.equal(inventory.medical_record_root_found, true);
    const receipt = await collectMedicalCategories(
      context,
      inspectLabStructure,
    );
    assert.equal(receipt.complete_medical_record, false);
    const lab = receipt.category_results.find(
      (result) => result.category === "laboratory",
    );
    assert.equal(lab.status, "VISIBLE_TABLES_CAPTURED");
    assert.equal(lab.row_count, 1);
    assert.equal(
      receipt.category_results.find(
        (result) => result.category === "hospitalizations",
      ).status,
      "DESTINATION_NOT_ALLOWED",
    );
    assert.equal(
      receipt.category_results.find(
        (result) => result.category === "medications",
      ).status,
      "DESTINATION_NOT_ALLOWED",
    );
    assert.equal(
      await recordPage.evaluate(() => Boolean(window.unsafeAction)),
      false,
    );
    for (const forbidden of [
      "FICTIONAL_ONLY",
      "7.3",
      "UNSELECTED_RECORD",
      "12345",
    ])
      assert.ok(!JSON.stringify(receipt).includes(forbidden));
    const unrelated = await recordPage.evaluate(collectCategoryTables, {
      category: "diagnoses",
    });
    assert.equal(unrelated.status, "CATEGORY_ADAPTER_REQUIRED");
    await recordPage.setContent('<button type="button">בדיקות מעבדה</button>');
    const blocked = await collectMedicalCategories(
      context,
      inspectLabStructure,
    );
    assert.equal(blocked.status, "MEDICAL_MENU_NOT_RECOGNIZED");
  } finally {
    await browser.close();
  }
});
test("trusted destinations reject lookalike hosts and non-HTTPS", () => {
  assert.equal(
    isTrustedClalit("https://e-services.clalit.co.il/results"),
    true,
  );
  for (const url of [
    "https://clalit.co.il.evil.invalid",
    "http://clalit.co.il",
    "javascript:alert(1)",
  ])
    assert.equal(isTrustedClalit(url), false);
});

test("lab report Show action reads values temporarily and skips sending actions without exposing records", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route("https://e-services.clalit.co.il/**", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `
    <nav><a href="javascript:void(0)">תיק רפואי אישי</a><button type="button" onclick="document.querySelector('main').innerHTML=document.querySelector('template').innerHTML">בדיקות מעבדה</button></nav><main></main>
    <template><table><thead><tr><th>תאריך בדיקה</th><th>מספר בדיקה</th><th>תוצאות בדיקה</th></tr></thead><tbody>
    <tr><td>01.01.2026</td><td>11111111</td><td><a href="#detail" onclick="document.querySelector('#detail').innerHTML=document.querySelector('#values').innerHTML">הצגה</a></td></tr>
    <tr><td>02.01.2026</td><td>22222222</td><td><a href="#send" onclick="window.unsafeAction=true">שליחה</a></td></tr>
    </tbody></table><div id="detail"></div></template>
    <template id="values"><p>מספר בדיקה: 11111111</p><table><thead><tr><th>שם הבדיקה</th><th>תוצאת הבדיקה</th><th>טווח הנורמה</th></tr></thead><tbody><tr><td>FICTIONAL_RESULT_ALPHA</td><td>7.3</td><td>5–10</td></tr></tbody></table></template>`,
      }),
    );
    const page = await context.newPage();
    await page.goto("https://e-services.clalit.co.il/fictional-record");
    const receipt = await collectMedicalCategories(
      context,
      inspectLabStructure,
    );
    const details = receipt.category_results.find(
      (result) => result.category === "laboratory",
    ).details;
    assert.equal(details.record_count, 2);
    assert.equal(details.record_results[0].status, "RESULT_VALUES_CAPTURED");
    assert.equal(details.record_results[0].value_count, 1);
    assert.equal(
      details.record_results[0].source_matches_selected_record,
      true,
    );
    assert.equal(
      details.record_results[1].status,
      "RESULT_LINK_ADAPTER_REQUIRED",
    );
    assert.equal(
      await page.evaluate(() => Boolean(window.unsafeAction)),
      false,
    );
    for (const value of [
      "FICTIONAL_RESULT_ALPHA",
      "7.3",
      "11111111",
      "22222222",
      "01.01.2026",
    ])
      assert.ok(!JSON.stringify(receipt).includes(value));
    assert.equal(details.association_verified, false);
    await page.evaluate(() => {
      const values = document.querySelector("#values");
      values.innerHTML = values.innerHTML.replace("11111111", "33333333");
    });
    const mismatched = await collectMedicalCategories(
      context,
      inspectLabStructure,
    );
    const wrongSource = mismatched.category_results.find(
      (result) => result.category === "laboratory",
    ).details;
    assert.equal(wrongSource.record_results[0].source_reference_found, true);
    assert.equal(
      wrongSource.record_results[0].source_matches_selected_record,
      false,
    );
    assert.equal(wrongSource.association_verified, false);
    assert.equal(
      wrongSource.record_results[0].status,
      "RESULT_SOURCE_MISMATCH",
    );
    assert.equal(mismatched.temporary_collection.record_count, 0);
    assert.ok(!JSON.stringify(mismatched).includes("33333333"));
  } finally {
    await browser.close();
  }
});
