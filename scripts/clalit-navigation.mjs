import {
  rememberMedicalRecord,
  rememberCoverage,
  clearCollectedRecords,
  collectedCounts,
  collectorState,
} from "./clalit-import-state.mjs";
// Deterministic, local, read-only navigation of recognized medical-record menu labels.
// Never clicks login/profile controls, care requests, messages, prescriptions or download controls.
const rootLabels = [
  "תיק רפואי אישי",
  "התיק הרפואי האישי",
  "התיק הרפואי",
  "תיק רפואי שלי",
  "המידע הרפואי שלי",
  "התיק הרפואי שלי",
  "תיק רפואי",
  "My medical record",
];
const categories = [
  {
    id: "medical_summary",
    labels: ["סיכום מידע רפואי", "סיכום רפואי", "Medical summary"],
  },
  {
    id: "laboratory",
    labels: [
      "בדיקות מעבדה",
      "תוצאות בדיקות מעבדה",
      "תוצאות בדיקות",
      "בדיקות דם",
      "Laboratory results",
    ],
  },
  {
    id: "visits",
    labels: ["סיכומי ביקור", "סיכומי ביקורים", "Visit summaries"],
  },
  { id: "hospitalizations", labels: ["סיכומי אשפוז", "Hospital summaries"] },
  {
    id: "diagnoses",
    labels: [
      "אבחנות",
      "בעיות רפואיות",
      "אבחנות והמלצות",
      "אבחנות קבועות",
      "Diagnoses",
    ],
  },
  {
    id: "medications",
    labels: [
      "רשימת תרופות",
      "התרופות שלי",
      "תרופות",
      "תרופות קבועות",
      "מרשמים ותרופות",
      "ניפוק תרופות",
      "Medications",
    ],
  },
  {
    id: "allergies",
    labels: ["רגישויות", "אלרגיות", "רגישויות ואלרגיות", "Allergies"],
  },
  {
    id: "imaging",
    labels: ["בדיקות דימות", "תוצאות דימות", "Imaging results"],
  },
  { id: "vaccinations", labels: ["חיסונים", "Vaccinations"] },
];
export const isTrustedClalit = (raw) => {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      (u.hostname === "clalit.co.il" || u.hostname.endsWith(".clalit.co.il"))
    );
  } catch {
    return false;
  }
};
async function frameIsVisible(frame) {
  for (let node = frame; node.parentFrame(); node = node.parentFrame())
    try {
      if (!(await (await node.frameElement()).isVisible())) return false;
    } catch {
      return false;
    }
  return true;
}
async function knownMenuCounts(context) {
  const groups = [
    { id: "medical_record_root", labels: rootLabels },
    ...categories,
    {
      id: "session_exit_control",
      labels: ["יציאה", "התנתקות", "Logout", "Sign out"],
    },
  ];
  const counts = [];
  let frameIndex = 0;
  for (const page of context.pages())
    for (const frame of page.frames()) {
      const index = frameIndex++;
      if (!isTrustedClalit(frame.url())) continue;
      const parent_visible = await frameIsVisible(frame);
      for (const group of groups) {
        let total = 0,
          visible = 0;
        const controls = [];
        for (let variant = 0; variant < group.labels.length; variant++) {
          const locator = frame.getByText(group.labels[variant], {
            exact: true,
          });
          total += await locator.count();
          for (let item = 0; item < (await locator.count()); item++)
            if (parent_visible && (await locator.nth(item).isVisible())) {
              visible++;
              const shape = await locator.nth(item).evaluate((element) => {
                const anchor = element.closest("a"),
                  button = element.closest("button,[role=button],[role=link]");
                const ancestors = [];
                for (
                  let node = element, depth = 0;
                  node && depth < 5;
                  node = node.parentElement, depth++
                )
                  ancestors.push({
                    tag: node.tagName,
                    role: node.getAttribute("role"),
                  });
                const box = element.getBoundingClientRect();
                const hit = document.elementFromPoint(
                  box.left + box.width / 2,
                  box.top + box.height / 2,
                );
                const clickable =
                  element.closest("a,button,[role=button],[role=link]") ||
                  element;
                return {
                  click_point_available: Boolean(
                    hit && (hit === clickable || clickable.contains(hit)),
                  ),
                  blocking_tag: hit ? hit.tagName : null,
                  blocking_dialog: Boolean(
                    hit?.closest("[role=dialog],[aria-modal=true],dialog"),
                  ),
                  tag: element.tagName,
                  anchor_found: Boolean(anchor),
                  button_found: Boolean(button),
                  in_navigation: Boolean(
                    element.closest("nav,aside,[role=navigation]"),
                  ),
                  has_destination: Boolean(anchor?.getAttribute("href")),
                  destination_scheme: anchor
                    ? new URL(anchor.href).protocol
                    : null,
                  inert_toggle: Boolean(
                    anchor &&
                    /^(?:#|javascript:\s*void\s*\(\s*0\s*\)\s*;?)$/i.test(
                      anchor.getAttribute("href") || "",
                    ),
                  ),
                  ancestors,
                };
              });
              controls.push({ caption_variant_index: variant, ...shape });
            }
        }
        if (total)
          counts.push({
            frame_index: index,
            category: group.id,
            total_matches: total,
            visible_matches: visible,
            parent_frame_visible: parent_visible,
            controls,
          });
      }
    }
  return counts;
}
async function locateUnique(context, labels) {
  const found = [];
  for (const page of context.pages())
    for (const frame of page.frames()) {
      if (!isTrustedClalit(frame.url()) || !(await frameIsVisible(frame)))
        continue;
      for (const label of labels) {
        const locator = frame.getByText(label, { exact: true });
        for (let index = 0; index < (await locator.count()); index++) {
          const item = locator.nth(index);
          if (!(await item.isVisible())) continue;
          const shape = await item.evaluate((element) => ({
            interactive: Boolean(
              element.closest("a,button,[role=button],[role=link]"),
            ),
            in_navigation: Boolean(
              element.closest("nav,aside,[role=navigation]"),
            ),
          }));
          if (shape.interactive)
            found.push({ frame, item, in_navigation: shape.in_navigation });
        }
      }
    }
  const navigation = found.filter((item) => item.in_navigation);
  const eligible = navigation.length ? navigation : found;
  return eligible.length === 1 ? eligible[0] : null;
}
async function navigate(control) {
  try {
    const target = await control.item.evaluate((element) => {
      const button = element.closest("button,input");
      if (button && button.type === "submit") return { download: true };
      const anchor = element.closest("a");
      return anchor
        ? {
            href: anchor.href,
            download: anchor.hasAttribute("download"),
            inert_toggle: Boolean(
              element.closest("nav,aside,[role=navigation]") &&
              /^(?:#|javascript:\s*void\s*\(\s*0\s*\)\s*;?)$/i.test(
                anchor.getAttribute("href") || "",
              ),
            ),
          }
        : null;
    });
    if (
      target &&
      (target.download ||
        (!target.inert_toggle && !isTrustedClalit(target.href)) ||
        /\.(pdf|xlsx?|csv|docx?)(?:[?#]|$)/i.test(target.href))
    )
      return { ok: false, status: "DESTINATION_NOT_ALLOWED" };
    if (target && !target.inert_toggle) {
      // Follow only the HTTPS destination observed on the validated read-only menu link.
      // This performs normal authenticated navigation; it does not call hidden APIs or bypass login.
      await control.frame
        .page()
        .goto(target.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    } else {
      await control.item.click({ timeout: 10000 });
    }
    await control.frame
      .page()
      .waitForLoadState("domcontentloaded", { timeout: 10000 })
      .catch(() => {});
    return { ok: true };
  } catch (error) {
    // Never print Playwright error messages: they can include page text, tokens or URLs.
    return {
      ok: false,
      status:
        error?.name === "TimeoutError"
          ? "MENU_CONTROL_TIMEOUT"
          : "MENU_NAVIGATION_CHANGED",
    };
  }
}
async function safeNavigationCaptions(context) {
  const words = new Set([
    "תיק",
    "רפואי",
    "אישי",
    "מידע",
    "סיכום",
    "סיכומי",
    "המידע",
    "הרפואי",
    "שלי",
    "אבחנות",
    "קבועות",
    "והמלצות",
    "רגישויות",
    "ואלרגיות",
    "אלרגיות",
    "תרופות",
    "מרשמים",
    "ותרופות",
    "ניפוק",
    "מעבדה",
    "בדיקות",
    "תוצאות",
    "דימות",
    "הדמיה",
    "ביקור",
    "ביקורים",
    "אשפוז",
    "אשפוזים",
    "חיסונים",
    "הפניות",
    "המלצות",
    "נתונים",
    "כללי",
    "אישורים",
    "בתי",
    "חולים",
    "רגישות",
    "רשימת",
    "מדדים",
    "להדפסה",
    "מכתבים",
    "סיכומים",
    "סיכום",
    "מרפאות",
    "רופאים",
    "יועצים",
    "רופא",
    "משפחה",
    "בדיקה",
    "בדיקות",
    "מיקרוביולוגיה",
    "צילומים",
    "ופענוחים",
  ]);
  const captions = [];
  for (const page of context.pages())
    for (const frame of page.frames()) {
      if (!isTrustedClalit(frame.url()) || !(await frameIsVisible(frame)))
        continue;
      const labels = await frame.evaluate(
        (allowedWords) => {
          const allowed = new Set(allowedWords),
            result = new Set();
          for (const link of document.querySelectorAll(
            "nav a,nav button,[role=navigation] a,aside a",
          )) {
            const caption = (link.innerText || "")
              .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
              .replace(/\s+/g, " ")
              .trim();
            if (
              caption &&
              caption.length < 100 &&
              caption.split(" ").every((word) => allowed.has(word))
            )
              result.add(caption);
          }
          return [...result];
        },
        [...words],
      );
      captions.push(...labels);
    }
  return [...new Set(captions)];
}
export async function inspectMedicalMenus(context, structure) {
  const frames = [];
  for (const page of context.pages())
    for (const frame of page.frames()) {
      // Hosts only, never path/query/fragment or page text. about:blank is omitted.
      let hostname;
      try {
        const u = new URL(frame.url());
        if (!/^https?:$/.test(u.protocol)) continue;
        hostname = u.hostname;
      } catch {
        continue;
      }
      const trusted = isTrustedClalit(frame.url());
      frames.push({
        hostname,
        trusted,
        ...(trusted ? { structure: await frame.evaluate(structure) } : {}),
      });
    }
  const available = [];
  for (const category of categories)
    if (await locateUnique(context, category.labels))
      available.push(category.id);
  return {
    status: "MEDICAL_MENU_INVENTORY",
    medical_record_root_found: Boolean(await locateUnique(context, rootLabels)),
    recognized_categories: available,
    known_menu_counts: await knownMenuCounts(context),
    safe_navigation_captions: await safeNavigationCaptions(context),
    frames,
  };
}
// Runs only in the category page opened through a recognized medical-record menu.
export function collectCategoryTables({ category } = {}) {
  const headerPatterns = {
    medical_summary: /בעיה|אבחנ|מחלה|diagnos|condition|problem/i,
    laboratory: /בדיקה|תוצאה|analyte|test|result/i,
    visits: /ביקור|סיכום|visit|summary/i,
    hospitalizations: /אשפוז|שחרור|admission|discharge/i,
    diagnoses: /אבחנ|בעיה|מחלה|diagnos|condition|problem/i,
    medications: /תרופה|מינון|drug|medication|dose/i,
    allergies: /רגישות|אלרג|allerg/i,
    imaging: /דימות|פענוח|imaging|radiolog/i,
    vaccinations: /חיסון|vaccin/i,
  };
  const visible = (e) => {
    const box = e.getBoundingClientRect(),
      style = getComputedStyle(e);
    return (
      box.width > 0 &&
      box.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  };
  const roots = [document];
  for (let index = 0; index < roots.length && roots.length < 100; index++)
    for (const e of roots[index].querySelectorAll("*"))
      if (e.shadowRoot) roots.push(e.shadowRoot);
  const tables = [];
  for (const root of roots)
    for (const table of root.querySelectorAll(
      "table,[role=table],[role=grid]",
    )) {
      if (!visible(table)) continue;
      const belongs = (e) =>
        e.closest("table,[role=table],[role=grid]") === table;
      const rows = [...table.querySelectorAll("tr,[role=row]")].filter(
        (e) => visible(e) && belongs(e),
      );
      const headers = [
        ...table.querySelectorAll("thead th,thead td,[role=columnheader]"),
      ]
        .filter((e) => visible(e) && belongs(e))
        .map((e) => e.innerText.replace(/\s+/g, " ").trim());
      // Do not collect identity/profile tables or unlabelled layout tables.
      if (
        !headers.length ||
        !headerPatterns[category] ||
        !headers.some((header) => headerPatterns[category].test(header)) ||
        headers.some((h) =>
          /תעודת זהות|מספר זהות|כתובת|טלפון|שם המטופל|patient name|address|phone|identity/i.test(
            h,
          ),
        )
      )
        continue;
      const values = [];
      for (const row of rows) {
        if (row.closest("thead")) continue;
        const cells = [
          ...row.querySelectorAll("td,[role=cell],[role=gridcell]"),
        ]
          .filter(
            (e) =>
              visible(e) && belongs(e) && e.closest("tr,[role=row]") === row,
          )
          .map((e) => e.innerText.replace(/\s+/g, " ").trim());
        if (!cells.length || cells.every((cell) => !cell)) continue;
        if (
          cells.length !== headers.length ||
          cells.some((cell) => cell.length > 4000)
        )
          return { status: "CATEGORY_ADAPTER_REQUIRED", tables: [] };
        values.push(cells);
      }
      if (values.length > 500) return { status: "CATEGORY_LIMIT", tables: [] };
      if (values.length) tables.push({ headers, rows: values });
    }
  return {
    status: tables.length
      ? "VISIBLE_TABLES_CAPTURED"
      : "CATEGORY_ADAPTER_REQUIRED",
    tables,
  };
}
async function readLaboratoryReports(page) {
  const { collectVisibleLabTable } = await import(
    `./clalit-table-reader.mjs?detail=${Date.now()}`
  );
  const lists = [];
  for (const frame of page.frames()) {
    if (!isTrustedClalit(frame.url()) || !(await frameIsVisible(frame)))
      continue;
    const tables = frame.locator("table");
    for (let index = 0; index < (await tables.count()); index++) {
      const table = tables.nth(index);
      if (!(await table.isVisible())) continue;
      const isList = await table.evaluate((element) => {
        const headers = [...element.querySelectorAll("thead th,thead td")].map(
          (cell) => cell.innerText,
        );
        return (
          headers.some((header) => /תאריך|מועד|date/i.test(header)) &&
          headers.some((header) => /מספר|number/i.test(header))
        );
      });
      if (isList) lists.push({ frame, table });
    }
  }
  if (lists.length !== 1)
    return { status: "REPORT_LIST_ADAPTER_REQUIRED", record_count: 0 };
  const { frame, table } = lists[0];
  const rows = table.locator("tbody tr");
  const count = await rows.count();
  if (count > 50) return { status: "REPORT_LIST_LIMIT", record_count: count };
  const receipts = [],
    temporary = [];
  try {
    for (let index = 0; index < count; index++) {
      if (frame.isDetached() || !isTrustedClalit(frame.url())) {
        receipts.push({
          record_index: index,
          status: "LIST_NAVIGATION_CHANGED",
        });
        break;
      }
      const anchors = rows.nth(index).locator("a");
      if ((await anchors.count()) !== 1) {
        receipts.push({ record_index: index, status: "RESULT_LINK_AMBIGUOUS" });
        continue;
      }
      const link = anchors.first();
      const target = await link.evaluate((element) => {
        const caption = (
          element.innerText ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.querySelector("img")?.getAttribute("alt") ||
          ""
        )
          .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const readOnly =
          /^(?:(?:ל)?צפי[יי]?ה(?:\s+(?:בתוצאות|בתוצאותיה|בתוצאת|בבדיקה|תוצאות|הבדיקה))*|(?:הצג|הצגת|הצגה|להצגה|להציג|פרטים|לפרטים|פירוט|לפירוט)(?:\s+(?:תוצאות|הבדיקה|בדיקה|בדיקות|הבדיקות|מעבדה|כל|מלאות))*|(?:כל\s+)?(?:תוצאות|לתוצאות)(?:\s+(?:הבדיקה|בדיקה|מעבדה))*|ביוכימיה|המטולוגיה|מיקרוביולוגיה|סרולוגיה|דם|שתן|\d{4,16}|\d{1,2}[./-]\d{1,2}[./-]\d{4})$/i.test(
            caption,
          );
        const vocab = new Set([
          "צפייה",
          "צפיה",
          "לצפייה",
          "לצפיה",
          "בתוצאות",
          "תוצאות",
          "הבדיקה",
          "בדיקה",
          "בדיקות",
          "הצג",
          "הצגת",
          "להציג",
          "פרטים",
          "לפרטים",
          "פירוט",
          "לפירוט",
          "מלאות",
          "לתוצאות",
          "כל",
          "מעבדה",
          "לבחירת",
          "בחר",
          "בחירה",
          "בחירת",
          "תצוגה",
          "הצגה",
          "להצגה",
        ]);
        const safeCaption =
          caption && caption.split(" ").every((word) => vocab.has(word))
            ? caption
            : null;
        const row = element.closest("tr"),
          table = row?.closest("table");
        const headers = table
          ? [...table.querySelectorAll("thead th,thead td")].map(
              (cell) => cell.innerText,
            )
          : [];
        const cells = row
          ? [...row.querySelectorAll("td")].map((cell) => cell.innerText.trim())
          : [];
        const typeColumn = headers.findIndex((header) =>
          /מעבדה|מכון|סוג.*בדיקה|שם.*בדיקה|department|type/i.test(header),
        );
        const source_title_from_list =
          typeColumn >= 0
            ? cells[typeColumn]?.trim().slice(0, 160) || null
            : null;
        const referenceColumn = headers.findIndex((header) =>
          /מספר.*בדיקה|מספר.*בקשה|test number|record number/i.test(header),
        );
        const dateColumn = headers.findIndex((header) =>
          /תאריך|מועד|date/i.test(header),
        );
        const source_reference_from_list =
          referenceColumn >= 0
            ? cells[referenceColumn]?.match(/\b\d{4,16}\b/)?.[0] || null
            : null;
        const source_date_from_list =
          dateColumn >= 0
            ? cells[dateColumn]
                ?.match(/\d{1,2}[./-]\d{1,2}[./-]\d{4}/)?.[0]
                ?.replace(/[/-]/g, ".") || null
            : null;
        return {
          source_reference_from_list,
          source_title_from_list,
          source_date_from_list,
          read_only: readOnly,
          download: element.hasAttribute("download"),
          href: element.href,
          inline_viewer:
            element.hasAttribute("onclick") ||
            element.href.replace(/#.*$/, "") ===
              document.location.href.replace(/#.*$/, ""),
          link_shape: {
            safe_ui_caption: safeCaption,
            has_text: Boolean(element.innerText?.trim()),
            has_title: Boolean(element.getAttribute("title")),
            has_image: Boolean(element.querySelector("img")),
            destination_scheme: element.href.split(":")[0],
          },
        };
      });
      if (
        !target.read_only ||
        target.download ||
        /\.(pdf|xlsx?|csv|docx?)(?:[?#]|$)/i.test(target.href)
      ) {
        receipts.push({
          record_index: index,
          status: "RESULT_LINK_ADAPTER_REQUIRED",
          link_shape: target.link_shape,
        });
        continue;
      }
      try {
        if (
          !target.href.startsWith("https:") &&
          !target.href.startsWith("javascript:") &&
          target.href !== ""
        ) {
          receipts.push({
            record_index: index,
            status: "DESTINATION_NOT_ALLOWED",
          });
          continue;
        }
        if (target.href.startsWith("https:") && !target.inline_viewer) {
          if (!isTrustedClalit(target.href)) {
            receipts.push({
              record_index: index,
              status: "DESTINATION_NOT_ALLOWED",
            });
            continue;
          }
          // Preserve the list in its original tab and open only this observed report destination.
          const report = await page.context().newPage();
          try {
            await report.goto(target.href, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            });
            if (!isTrustedClalit(report.url()))
              throw new Error("REPORT_DESTINATION_DENIED");
            const extracted = await report.evaluate(collectVisibleLabTable);
            if (
              extracted.status === "READY" &&
              target.source_reference_from_list &&
              extracted.metadata.record_reference &&
              extracted.metadata.record_reference !==
                target.source_reference_from_list
            ) {
              receipts.push({
                record_index: index,
                status: "RESULT_SOURCE_MISMATCH",
                source_reference_found: true,
                source_matches_selected_record: false,
              });
              continue;
            }
            if (extracted.status === "READY") {
              temporary.push(extracted);
              rememberMedicalRecord(
                "laboratory",
                extracted.rows.map((row) =>
                  Object.entries(row)
                    .filter(([, value]) => value !== null)
                    .map(([label, value]) => label + ": " + value)
                    .join(" | "),
                ),
                extracted.metadata,
                target.href.startsWith("https:") && !target.inline_viewer
                  ? target.href
                  : frame.url(),
                Boolean(
                  target.source_reference_from_list &&
                  extracted.metadata.record_reference ===
                    target.source_reference_from_list,
                ),
                target.source_title_from_list
                  ? "Clalit laboratory report — " +
                      target.source_title_from_list
                  : null,
              );
              receipts.push({
                record_index: index,
                status: "RESULT_VALUES_CAPTURED",
                value_count: extracted.rows.length,
                source_matches_selected_record: Boolean(
                  target.source_reference_from_list &&
                  extracted.metadata.record_reference ===
                    target.source_reference_from_list,
                ),
                source_reference_found: Boolean(
                  extracted.metadata.record_reference,
                ),
              });
            } else
              receipts.push({
                record_index: index,
                status: "RESULT_TABLE_ADAPTER_REQUIRED",
              });
          } finally {
            await report.close();
          }
        } else {
          // Click a recognized read-result action in the observed lab listing, never arbitrary script evaluation.
          await link.click({ timeout: 10000 });
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});
          const extracted = await frame.evaluate(collectVisibleLabTable);
          if (
            extracted.status === "READY" &&
            target.source_reference_from_list &&
            extracted.metadata.record_reference &&
            extracted.metadata.record_reference !==
              target.source_reference_from_list
          ) {
            receipts.push({
              record_index: index,
              status: "RESULT_SOURCE_MISMATCH",
              source_reference_found: true,
              source_matches_selected_record: false,
            });
            continue;
          }
          if (extracted.status === "READY") {
            temporary.push(extracted);
            rememberMedicalRecord(
              "laboratory",
              extracted.rows.map((row) =>
                Object.entries(row)
                  .filter(([, value]) => value !== null)
                  .map(([label, value]) => label + ": " + value)
                  .join(" | "),
              ),
              extracted.metadata,
              target.href.startsWith("https:") && !target.inline_viewer
                ? target.href
                : frame.url(),
              Boolean(
                target.source_reference_from_list &&
                extracted.metadata.record_reference ===
                  target.source_reference_from_list,
              ),
              target.source_title_from_list
                ? "Clalit laboratory report — " + target.source_title_from_list
                : null,
            );
            receipts.push({
              record_index: index,
              status: "RESULT_VALUES_CAPTURED",
              value_count: extracted.rows.length,
              source_matches_selected_record: Boolean(
                target.source_reference_from_list &&
                extracted.metadata.record_reference ===
                  target.source_reference_from_list,
              ),
              source_reference_found: Boolean(
                extracted.metadata.record_reference,
              ),
            });
          } else
            receipts.push({
              record_index: index,
              status: "RESULT_TABLE_ADAPTER_REQUIRED",
            });
        }
      } catch (error) {
        receipts.push({
          record_index: index,
          status:
            error?.name === "TimeoutError"
              ? "RESULT_CONTROL_TIMEOUT"
              : "RESULT_NAVIGATION_CHANGED",
        });
      }
    }
    return {
      status: "LABORATORY_DETAIL_PILOT",
      record_count: count,
      record_results: receipts,
      association_verified:
        receipts.length === count &&
        receipts.every(
          (receipt) =>
            receipt.status === "RESULT_VALUES_CAPTURED" &&
            receipt.source_matches_selected_record === true,
        ),
    };
  } finally {
    temporary.length = 0;
  }
}
export async function collectMedicalCategories(context, inspectStructure) {
  clearCollectedRecords();
  const root = await locateUnique(context, rootLabels);
  if (!root)
    return {
      status: "MEDICAL_MENU_NOT_RECOGNIZED",
      inventory: await inspectMedicalMenus(context, inspectStructure),
      complete_medical_record: false,
      pdf_saved: false,
      results_uploaded: false,
      ai_processing: false,
    };
  const recordPage = root.frame.page();
  const ownPage = { pages: () => [recordPage] };
  let inventory = await inspectMedicalMenus(ownPage, inspectStructure);
  // Do not toggle an already expanded menu closed when categories are accessible.
  if (!inventory.recognized_categories.length) {
    const opened = await navigate(root);
    if (!opened.ok)
      return { status: opened.status, complete_medical_record: false };
    inventory = await inspectMedicalMenus(ownPage, inspectStructure);
  }
  const results = [],
    temporary = [];
  collectorState().running = true;
  try {
    for (const category of categories) {
      const control = await locateUnique(ownPage, category.labels);
      if (!control) {
        rememberCoverage(category.id, "menu_not_recognized", 0);
        results.push({ category: category.id, status: "MENU_NOT_RECOGNIZED" });
        continue;
      }
      const opened = await navigate(control);
      if (!opened.ok) {
        rememberCoverage(category.id, "not_accessible", 0);
        results.push({ category: category.id, status: opened.status });
        continue;
      }
      let rowCount = 0,
        tableCount = 0,
        changed = false;
      for (const frame of recordPage.frames()) {
        if (!isTrustedClalit(frame.url()) || !(await frameIsVisible(frame)))
          continue;
        let extracted;
        collectorState().running = true;
        try {
          extracted = await frame.evaluate(collectCategoryTables, {
            category: category.id,
          });
        } catch {
          changed = true;
          continue;
        }
        if (extracted.status === "VISIBLE_TABLES_CAPTURED") {
          tableCount += extracted.tables.length;
          rowCount += extracted.tables.reduce(
            (sum, table) => sum + table.rows.length,
            0,
          );
          temporary.push(extracted);
          if (category.id !== "laboratory")
            rememberMedicalRecord(
              category.id,
              extracted.tables.flatMap((table) =>
                table.rows.map((row) =>
                  row
                    .map((value, index) => table.headers[index] + ": " + value)
                    .join(" | "),
                ),
              ),
              { record_reference: null, collection_date_text: null },
              frame.url(),
              false,
            );
        }
      }
      const details =
        category.id === "laboratory"
          ? await readLaboratoryReports(recordPage)
          : undefined;
      const collectedForCategory = [
        ...collectorState().records.values(),
      ].filter((record) => record.category === category.id).length;
      rememberCoverage(
        category.id,
        collectedForCategory ? "partial" : "adapter_required",
        collectedForCategory,
      );
      results.push({
        category: category.id,
        details,
        status: rowCount
          ? "VISIBLE_TABLES_CAPTURED"
          : changed
            ? "MENU_NAVIGATION_CHANGED"
            : "CATEGORY_ADAPTER_REQUIRED",
        table_count: tableCount,
        row_count: rowCount,
      });
    }
    return {
      status: "READ_ONLY_NAVIGATION_PILOT",
      temporary_collection: { ...collectedCounts(), running: false },
      inventory,
      category_results: results,
      complete_medical_record: false,
      limitations: [
        "Supported visible category tables and recognized laboratory detail reports only; document bodies, pagination and remaining collapsed sections require verified adapters.",
        "No diagnosis or clinical interpretation is performed.",
      ],
      pdf_saved: false,
      results_uploaded: false,
      ai_processing: false,
    };
  } finally {
    collectorState().running = false;
    temporary.length = 0;
  }
}
