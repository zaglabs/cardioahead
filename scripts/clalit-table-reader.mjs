// Runs inside the selected browser frame. Returns only the rendered result table.
export function collectVisibleLabTable() {
  const text = (e) =>
    (e.innerText || e.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim();
  const visible = (e) => {
    const r = e.getBoundingClientRect(),
      s = getComputedStyle(e);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s.display !== "none" &&
      s.visibility !== "hidden"
    );
  };
  const roots = [
    ...document.querySelectorAll('table,[role="table"],[role="grid"]'),
  ].filter(visible);
  const candidates = [];
  for (const root of roots) {
    const belongs = (e) =>
      e.closest('table,[role="table"],[role="grid"]') === root;
    const rows = [...root.querySelectorAll('tr,[role="row"]')].filter(
      (e) => visible(e) && belongs(e),
    );
    if (!rows.length) continue;
    let headers = [
      ...root.querySelectorAll('thead th,thead td,[role="columnheader"]'),
    ]
      .filter((e) => visible(e) && belongs(e))
      .map(text);
    let headerRow = null;
    if (!headers.length) {
      headerRow = rows[0];
      headers = [
        ...headerRow.querySelectorAll(
          'th,td,[role="columnheader"],[role="cell"]',
        ),
      ]
        .filter(visible)
        .map(text);
    }
    const name = headers.findIndex((h) =>
      /שם.*בדיקה|test\s*name|analyte/i.test(h),
    );
    const value = headers.findIndex((h) =>
      /^(תוצאה|תוצאות|ערך|תוצאת הבדיקה|תוצאות הבדיקה|ערך הבדיקה|ערכי הבדיקה|result|value)$/i.test(
        h,
      ),
    );
    if (name < 0 || value < 0) continue;
    const range = headers.findIndex((h) =>
      /טווח|נורמה|reference|range/i.test(h),
    );
    const units = headers.findIndex((h) => /יחידות|units?/i.test(h));
    const flag = headers.findIndex((h) => /חריג|abnormal|flag|status/i.test(h));
    const results = [];
    for (const row of rows) {
      if (row === headerRow || row.closest("thead")) continue;
      const cells = [
        ...row.querySelectorAll('td,[role="cell"],[role="gridcell"]'),
      ]
        .filter(
          (e) =>
            visible(e) && belongs(e) && e.closest('tr,[role="row"]') === row,
        )
        .map(text);
      if (!cells.length || !cells[name] || !cells[value]) continue;
      if (cells.length !== headers.length || cells.some((c) => c.length > 2000))
        return { status: "UNSUPPORTED_TABLE" };
      results.push({
        test_name: cells[name],
        value_text: cells[value],
        units_text: units < 0 ? null : cells[units] || null,
        reference_text: range < 0 ? null : cells[range] || null,
        flag_text: flag < 0 ? null : cells[flag] || null,
      });
    }
    if (results.length > 500) return { status: "TABLE_LIMIT" };
    if (results.length) candidates.push({ headers, rows: results });
  }
  if (candidates.length !== 1)
    return { status: candidates.length ? "AMBIGUOUS_TABLE" : "NO_LAB_TABLE" };
  // Only capture labelled provenance; never return the page body, profile name or ID.
  const body = document.body.innerText;
  const date =
    body.match(
      /(?:תאריך הבדיקה(?: ושעת הביצוע)?|תאריך ביצוע(?: הבדיקה)?|collection date|test date)\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}(?:\s+\d{2}:\d{2})?)/i,
    )?.[1] || null;
  const record =
    body.match(
      /(?:מספר בדיקה|מספר הבדיקה|test number)\s*:?\s*(\d{4,16})/i,
    )?.[1] || null;
  return {
    status: "READY",
    ...candidates[0],
    metadata: {
      provider: "Clalit",
      collection_date_text: date,
      record_reference: record,
    },
    scope:
      "selected rendered table; hidden notes, other pages and collapsed sections are not collected",
  };
}
