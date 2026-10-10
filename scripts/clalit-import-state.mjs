// Process-memory source buffer. Never writes medical records, credentials, cookies or documents to disk.
import { createHash } from "node:crypto";
import { validateMedicalBundle } from "../src/lib/medical-import/schema.mjs";
const slot = Symbol.for("cardioahead.personal-collector");
export function collectorState() {
  return (globalThis[slot] ||= {
    records: new Map(),
    coverage: new Map(),
    collected_at: null,
    expires_at: 0,
    server: null,
    nonce: null,
    connection: null,
    running: false,
    expiry_timer: null,
  });
}
export function clearCollectedRecords() {
  const state = collectorState();
  clearTimeout(state.expiry_timer);
  state.expiry_timer = null;
  state.records.clear();
  state.coverage.clear();
  state.collected_at = null;
  state.expires_at = 0;
}
export function rememberCoverage(category, status, count = 0) {
  const state = collectorState();
  state.coverage.set(category, { category, status, record_count: count });
}
export function rememberMedicalRecord(
  category,
  entries,
  metadata,
  url,
  verified,
  title = null,
) {
  const origin = new URL(url);
  if (
    origin.protocol !== "https:" ||
    (origin.hostname !== "clalit.co.il" &&
      !origin.hostname.endsWith(".clalit.co.il"))
  )
    throw new Error("SOURCE_ORIGIN_DENIED");
  const reference = metadata.record_reference || null,
    date = metadata.collection_date_text || null;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        provider: "clalit",
        category,
        reference,
        date,
        origin: origin.origin,
        path: origin.pathname,
        entries,
      }),
    )
    .digest("hex");
  const id =
    digest.slice(0, 8) +
    "-" +
    digest.slice(8, 12) +
    "-4" +
    digest.slice(13, 16) +
    "-8" +
    digest.slice(17, 20) +
    "-" +
    digest.slice(20, 32);
  const state = collectorState();
  if (!state.collected_at) state.collected_at = new Date().toISOString();
  const record = {
    id,
    category,
    title: title || `Clalit ${category.replaceAll("_", " ")} record`,
    record_date: date,
    provider_reference: reference,
    source_origin: origin.origin,
    source_path: origin.pathname,
    association_verified: Boolean(verified),
    entries: entries.map((text, index) => ({
      id: "entry_" + (index + 1),
      text,
    })),
  };
  state.records.set(id, record);
  state.expires_at = Date.now() + 45 * 60000;
  clearTimeout(state.expiry_timer);
  state.expiry_timer = setTimeout(clearCollectedRecords, 45 * 60000);
  state.expiry_timer.unref();
  return id;
}
export function collectedBundle() {
  const state = collectorState();
  if (!state.expires_at || state.expires_at <= Date.now()) {
    clearCollectedRecords();
    throw new Error("COLLECTION_EXPIRED");
  }
  return validateMedicalBundle({
    schema_version: 1,
    provider: "clalit",
    subject_scope: "self",
    collected_at: state.collected_at,
    records: [...state.records.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    coverage: [...state.coverage.values()].sort((a, b) =>
      a.category.localeCompare(b.category),
    ),
  });
}
export function collectedCounts() {
  const state = collectorState();
  if (state.expires_at && state.expires_at <= Date.now())
    clearCollectedRecords();
  return {
    running: Boolean(state.running),
    record_count: state.records.size,
    entry_count: [...state.records.values()].reduce(
      (sum, record) => sum + record.entries.length,
      0,
    ),
    categories: [
      ...new Set([...state.records.values()].map((record) => record.category)),
    ],
    expires_at: state.expires_at
      ? new Date(state.expires_at).toISOString()
      : null,
  };
}

export function collectedManifest() {
  collectedCounts();
  return [...collectorState().records.values()].map((record) => ({
    id: record.id,
    title: record.title,
    category: record.category,
    record_date: record.record_date,
    entry_count: record.entries.length,
    association_verified: record.association_verified,
  }));
}
export function selectedBundle(ids) {
  const bundle = collectedBundle();
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 200 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !bundle.records.some((record) => record.id === id))
  )
    throw new Error("INVALID_SOURCE_SELECTION");
  const records = bundle.records.filter((record) => ids.includes(record.id));
  return validateMedicalBundle({
    ...bundle,
    records,
    coverage: bundle.coverage.map((item) => ({
      ...item,
      status:
        records.filter((record) => record.category === item.category).length <
        item.record_count
          ? "partial"
          : item.status,
      record_count: records.filter(
        (record) => record.category === item.category,
      ).length,
    })),
  });
}
