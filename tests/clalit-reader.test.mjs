import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { collectVisibleLabTable } from "../scripts/clalit-table-reader.mjs";
import { inspectLabStructure } from "../scripts/clalit-structure.mjs";
const fixture = `<p>FICTIONAL DATA ONLY. מספר תעודת זהות: 999999999</p>
<p>תאריך הבדיקה ושעת הביצוע: 01.01.2026 09:00 מספר בדיקה: 11111111</p>
<table><thead><tr><th>שם הבדיקה</th><th>תוצאה</th><th>יחידות</th><th>טווח הנורמה</th></tr></thead>
<tbody><tr><td>SYNTHETIC_ALPHA</td><td>&lt; 7.3</td><td>mg/dL</td><td>5–10</td></tr>
<tr><td>SYNTHETIC_BETA</td><td>1,25</td><td>mmol/L</td><td></td></tr></tbody></table>`;
test("temporary lab extraction preserves exact visible values and provenance without collecting patient identifiers", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      fixture +
        '<table style="display:none"><tr><td>Private hidden material</td></tr></table>',
    );
    const shape = await page.evaluate(inspectLabStructure);
    assert.equal(shape.visible_tables, 1);
    const safeShape = JSON.stringify(shape);
    for (const sensitive of [
      "999999999",
      "11111111",
      "SYNTHETIC_ALPHA",
      "SYNTHETIC_BETA",
      "7.3",
      "1,25",
      "mg/dL",
      "01.01.2026",
    ])
      assert.ok(!safeShape.includes(sensitive));
    const result = await page.evaluate(collectVisibleLabTable);
    assert.equal(result.status, "READY");
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].value_text, "< 7.3");
    assert.equal(result.rows[1].value_text, "1,25");
    assert.equal(result.rows[0].units_text, "mg/dL");
    assert.equal(result.rows[1].reference_text, null);
    assert.equal(result.metadata.collection_date_text, "01.01.2026 09:00");
    assert.equal(result.metadata.record_reference, "11111111");
    assert.ok(!JSON.stringify(result).includes("999999999"));
    await page.setContent(fixture + fixture);
    assert.equal(
      (await page.evaluate(collectVisibleLabTable)).status,
      "AMBIGUOUS_TABLE",
    );
    await page.setContent(
      '<p>Login form only</p><input type="password" value="never-read">',
    );
    assert.equal(
      (await page.evaluate(collectVisibleLabTable)).status,
      "NO_LAB_TABLE",
    );
  } finally {
    await browser.close();
  }
});
