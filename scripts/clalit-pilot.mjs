// Local, human-supervised, single-page pilot. Does not connect to CardioAhead or AI.
import { chromium } from "@playwright/test";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  startImportBridge,
  stopImportBridge,
} from "./clalit-import-bridge.mjs";

const login =
  "https://e-services.clalit.co.il/OnlineWeb/General/InfoFullLogin.aspx";
const trusted = (url) => {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "clalit.co.il" || u.hostname.endsWith(".clalit.co.il"))
    );
  } catch {
    return false;
  }
};
const terminal = createInterface({ input: stdin, output: stdout });
const lifetime = new AbortController();
let browser,
  context,
  idle,
  temporary = null,
  attempt = 0,
  stage = "browser-start";
try {
  console.log(
    "CLALIT LOCAL PILOT: read-only medical-record navigation, your own account.",
  );
  console.log(
    "No original documents, screenshots, cookies or login credentials are exported. Import requires an owner-authorized CardioAhead connection. Claude processing follows the consent recorded in that connection.",
  );
  console.log(
    "A fresh private Chrome browser opens. Complete login yourself and select your OWN profile. The agent will identify the medical-record menus.",
  );
  console.log(
    "The browser/provider still have their normal data handling; this is not a zero-retention guarantee.",
  );
  await startImportBridge();
  console.log(
    "Private CardioAhead pairing is available on this computer at port 3184.",
  );
  browser = await chromium.launch({ headless: false, channel: "chrome" });
  context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  // No request/response/console listeners, login-field reads or browser storage exports.
  stage = "open-login-page";
  await page.goto(login, { waitUntil: "domcontentloaded", timeout: 45000 });
  idle = setTimeout(() => lifetime.abort(), 45 * 60 * 1000);
  while (!lifetime.signal.aborted) {
    stage = "wait-for-user";
    const answer = await terminal.question(
      "After login to your OWN profile: INSPECT lists menus, COLLECT navigates recognized medical sections, READ reads an open lab table, STOP closes: ",
      { signal: lifetime.signal },
    );
    const command = answer.trim();
    const { inspectLabStructure } = await import(
      `./clalit-structure.mjs?attempt=${++attempt}`
    );
    const navigation = await import(
      `./clalit-navigation.mjs?attempt=${attempt}`
    );
    if (command === "INSPECT" || command === "COLLECT") {
      stage =
        command === "INSPECT"
          ? "inspect-medical-menu"
          : "navigate-medical-menu";
      try {
        const receipt =
          command === "INSPECT"
            ? await navigation.inspectMedicalMenus(context, inspectLabStructure)
            : await navigation.collectMedicalCategories(
                context,
                inspectLabStructure,
              );
        console.log(JSON.stringify(receipt, null, 2));
      } catch (error) {
        console.log(
          JSON.stringify({
            status: "PILOT_COMMAND_FAILED",
            stage,
            error_kind:
              error?.name === "TimeoutError"
                ? "CONTROL_TIMEOUT"
                : "FRAME_OR_NAVIGATION_CHANGED",
          }),
        );
      }
      console.log(
        "Browser remains open. Source content is temporary; no original files or medical values are printed. Use your CardioAhead personal-card connection to import. Stop if access is blocked.",
      );
      continue;
    }
    if (command !== "READ") {
      console.log("Cancelled. No results retained.");
      break;
    }
    stage = "read-selected-table";
    // Reload only our local reader, so a verified layout adapter can be tested without another login.
    const { collectVisibleLabTable } = await import(
      `./clalit-table-reader.mjs?attempt=${++attempt}`
    );
    const found = [],
      diagnostics = [];
    let rejected = false;
    for (const candidatePage of context.pages()) {
      for (const frame of candidatePage.frames()) {
        if (!trusted(frame.url())) continue;
        const result = await frame.evaluate(collectVisibleLabTable);
        if (result.status === "READY") found.push(result);
        else if (result.status !== "NO_LAB_TABLE") rejected = true;
        diagnostics.push(await frame.evaluate(inspectLabStructure));
      }
    }
    if (found.length !== 1 || rejected) {
      found.length = 0;
      console.log(
        JSON.stringify(
          {
            status: "TABLE_NOT_RECOGNIZED",
            trusted_frame_count: diagnostics.length,
            structures: diagnostics,
          },
          null,
          2,
        ),
      );
      console.log(
        "No medical values printed or retained. Browser remains open for a supervised retry. Stop if access is blocked.",
      );
      continue;
    }
    temporary = found[0];
    console.log(
      JSON.stringify(
        {
          status: "EXTRACTION_SUCCEEDED",
          row_count: temporary.rows.length,
          collection_date_found: Boolean(
            temporary.metadata.collection_date_text,
          ),
          source_record_reference_found: Boolean(
            temporary.metadata.record_reference,
          ),
          rows_without_reference_text: temporary.rows.filter(
            (row) => !row.reference_text,
          ).length,
          scope: temporary.scope,
          pdf_saved: false,
          results_uploaded: false,
          ai_processing: false,
        },
        null,
        2,
      ),
    );
    temporary = null;
    found.length = 0;
    break;
  }
} catch {
  console.error(
    "PILOT_STOPPED",
    lifetime.signal.aborted ? "SESSION_EXPIRED" : "BROWSER_OR_EXTRACTION_ERROR",
    "stage:",
    stage,
  );
  console.error(
    "No medical result content is printed. Do not bypass access barriers.",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(idle);
  temporary = null;
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await stopImportBridge();
  terminal.close();
}
