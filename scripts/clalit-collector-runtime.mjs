import { chromium } from "playwright-core";
import {
  startImportBridge,
  stopImportBridge,
} from "./clalit-import-bridge.mjs";
import {
  collectorState,
  clearCollectedRecords,
  collectedCounts,
} from "./clalit-import-state.mjs";
import {
  inspectMedicalMenus,
  collectMedicalCategories,
} from "./clalit-navigation.mjs";
import { inspectLabStructure } from "./clalit-structure.mjs";
export async function createClalitCollector({
  launchOptions = { channel: "chrome", headless: false },
  port = 3184,
  browserType = chromium,
  sessionMs = 45 * 60000,
  completionPollMs = 5000,
  completionGraceMs = 10000,
  managedCleanup = process.env.CARDIOAHEAD_EPHEMERAL_COLLECTOR === "1",
} = {}) {
  let browser = null,
    medical = null,
    launch = null,
    closePromise = null,
    closing = false,
    timeout;
  const state = collectorState();
  async function ensureBrowser() {
    if (closing) throw Error("COLLECTOR_CLOSED");
    if (!browser) {
      launch ||= browserType.launch(launchOptions).then((created) => { browser = created; return created; });
      await launch;
    }
    if (closing) throw Error("COLLECTOR_CLOSED");
  }
  async function reset() {
    clearCollectedRecords();
    await medical?.close().catch(() => {});
    medical = null;
    state.workflow = { stage: "idle" };
  }
  async function close() {
    if (closePromise) return closePromise;
    closing = true;
    clearTimeout(timeout);
    clearCollectedRecords();
    closePromise = (async () => {
      // Startup may still be creating Chrome. Finish that operation before shutdown and disk cleanup.
      await launch?.catch(() => {});
      await reset();
      await browser?.close().catch(() => {});
      await stopImportBridge();
    })();
    return closePromise;
  }
  const handlers = {
    async openClalit() {
      await ensureBrowser();
      if (!medical)
        medical = await browser.newContext({ acceptDownloads: false });
      if (!medical.pages().length) {
        const page = await medical.newPage();
        await page.goto(
          "https://e-services.clalit.co.il/OnlineWeb/General/InfoFullLogin.aspx",
          { waitUntil: "domcontentloaded", timeout: 45000 },
        );
      }
      await medical.pages()[0]?.bringToFront();
      state.workflow = { stage: "signin" };
    },
    async collect() {
      if (!medical) throw Error("SIGNIN_REQUIRED");
      const inventory = await inspectMedicalMenus(medical, inspectLabStructure);
      const authenticated =
        inventory.medical_record_root_found &&
        inventory.known_menu_counts.some(
          (item) =>
            item.category === "session_exit_control" &&
            item.visible_matches > 0,
        );
      if (!authenticated) {
        state.workflow = { stage: "signin" };
        return;
      }
      await collectMedicalCategories(medical, inspectLabStructure);
      state.workflow = {
        stage: collectedCounts().record_count ? "review" : "error",
      };
    },
    cancel: reset,
    close,
  };
  await startImportBridge(port, handlers, { pollIntervalMs: completionPollMs, completionGraceMs, managedCleanup });
  timeout = setTimeout(() => void close(), sessionMs);
  return {
    handlers,
    close,
    isClosing: () => closing,
    openHome: async () => {
      await ensureBrowser();
      const context = await browser.newContext({ acceptDownloads: false });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:" + port + "/connect");
      return page;
    },
  };
}
