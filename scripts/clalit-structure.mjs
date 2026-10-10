// Structural diagnostics only: no text, attributes, URLs, identifiers or values returned.
export function inspectLabStructure() {
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      box.width > 0 &&
      box.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  };
  const roots = [document];
  for (let index = 0; index < roots.length && roots.length < 100; index++)
    for (const element of roots[index].querySelectorAll("*"))
      if (element.shadowRoot) roots.push(element.shadowRoot);
  const query = (selector) =>
    roots.flatMap((root) => [...root.querySelectorAll(selector)]);
  const count = (selector) => query(selector).filter(visible).length;
  const matches = (element, pattern) => {
    // Only short known field captions are examined, never returned.
    const caption = (element.innerText || "").replace(/\s+/g, " ").trim();
    return caption.length < 100 && pattern.test(caption);
  };
  const namePattern = /^(?:שם\s*(?:ה)?בדיקה|test\s*name|analyte)$/i;
  const valuePattern = /^(?:תוצאה|תוצאות|ערך|result|value)$/i;
  const labels = [...query("th,td,div,span,label,[role=columnheader]")].filter(
    visible,
  );
  const nameLabels = labels.filter((element) => matches(element, namePattern));
  const valueLabels = labels.filter((element) =>
    matches(element, valuePattern),
  );
  // Avoid duplicate ancestors that repeat the same caption.
  const leaves = nameLabels
    .filter(
      (element) =>
        !nameLabels.some(
          (child) => child !== element && element.contains(child),
        ),
    )
    .slice(0, 4);
  const shapes = leaves.map((leaf) => {
    const ancestors = [];
    let node = leaf;
    for (let level = 0; node && level < 6; level++, node = node.parentElement) {
      const tags = {};
      for (const child of [...node.children].filter(visible))
        tags[child.tagName] = (tags[child.tagName] || 0) + 1;
      ancestors.push({
        level,
        tag: node.tagName,
        child_tags: tags,
        contains_value_caption: valueLabels.some((label) =>
          node.contains(label),
        ),
        child_layout: [...node.children]
          .filter(visible)
          .slice(0, 12)
          .map((child) => ({
            tag: child.tagName,
            child_tags: [...child.children]
              .filter(visible)
              .slice(0, 12)
              .map((grandchild) => grandchild.tagName),
          })),
      });
    }
    return ancestors;
  });
  const table_shapes = query("table,[role=table],[role=grid]")
    .filter(visible)
    .map((table) => {
      const headerElements = [
        ...table.querySelectorAll("thead th,thead td,[role=columnheader]"),
      ].filter(visible);
      const headers = headerElements.map((element) =>
        element.innerText.replace(/\s+/g, " ").trim(),
      );
      const classify = (header) =>
        /^(?:תוצאה|תוצאות|ערך|result|value)$/i.test(header)
          ? "result_value"
          : /שם.*בדיקה|test\s*name|analyte/i.test(header)
            ? "test_name"
            : /תאריך|מועד|date/i.test(header)
              ? "record_date"
              : /מספר|number/i.test(header)
                ? "record_number"
                : /טווח|נורמה|range|reference/i.test(header)
                  ? "reference"
                  : /סוג.*בדיקה|מחלקה|type|department/i.test(header)
                    ? "record_type"
                    : "other";
      const rows = [...table.querySelectorAll("tbody tr,[role=row]")]
        .filter(visible)
        .filter((row) => !row.closest("thead"));
      return {
        header_categories: headers.map(classify),
        row_count: rows.length,
        row_link_counts: rows
          .slice(0, 20)
          .map((row) => ({
            anchor_count: row.querySelectorAll("a").length,
            button_count: row.querySelectorAll("button,[role=button]").length,
          })),
      };
    });
  return {
    visible_tables: count("table"),
    table_shapes,
    visible_dialogs: count("dialog,[role=dialog],[aria-modal=true]"),
    visible_iframes: count("iframe"),
    visible_semantic_grids: count("[role=table],[role=grid]"),
    visible_rows: count("tr,[role=row]"),
    visible_cells: count("td,th,[role=cell],[role=gridcell]"),
    known_name_caption_count: nameLabels.length,
    known_value_caption_count: valueLabels.length,
    caption_ancestor_shapes: shapes,
  };
}
