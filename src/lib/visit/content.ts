import {
  visitFields,
  type Findings,
  type LifestyleContent,
  type LocalizedReport,
  type ReportContent,
} from "./types";
import type { Bilingual } from "@/lib/clinical/types";
export const fieldLabels: Record<string, Bilingual> = {
  reason: { he: "סיבת הביקור", en: "Reason for the visit" },
  findings: { he: "ממצאים מהביקור", en: "Visit findings" },
  assessment: { he: "הערכה ומסקנות", en: "Assessment and conclusions" },
  plan: { he: "תכנית טיפול מוסכמת", en: "Agreed treatment plan" },
  medications: { he: "הנחיות לתרופות", en: "Medication instructions" },
  referrals: { he: "בדיקות והפניות", en: "Tests and referrals" },
  follow_up: { he: "המשך מעקב", en: "Follow-up arrangements" },
  warning_signs: {
    he: "סימני אזהרה והנחיות",
    en: "Warning signs and instructions",
  },
  prevention: { he: "מניעה ואורח חיים", en: "Prevention & Lifestyle" },
  additional: { he: "מידע נוסף", en: "Additional information" },
};
export const blankBi = (): Bilingual => ({ he: "", en: "" });
export const blankFields = () =>
  Object.fromEntries(
    visitFields.map((k) => [k, blankBi()]),
  ) as Findings["fields"];
export function emptyReport(name: string, date = ""): ReportContent {
  return {
    patient_name: name,
    patient_reference: "",
    visit_date: date,
    clinician_name: "",
    clinic_name: "מרפאת פרופ׳ אלעד מאור / Prof. Elad Maor's clinic",
    clinic_contact: "https://eladmaor.co.il/",
    fields: blankFields(),
    lifestyle: [],
    next_steps: [],
  };
}
function string(v: unknown, max = 2000) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(
      v,
    )
  )
    throw new Error("INVALID_REPORT_CONTENT");
  return v.trim();
}
export function bi(v: unknown, max = 2000): Bilingual {
  const b = v as Bilingual;
  if (!b || typeof b !== "object") throw new Error("INVALID_REPORT_CONTENT");
  return { he: string(b.he, max), en: string(b.en, max) };
}
export function validDate(s: string, required = false) {
  if (!s) return !required;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s
  );
}
export function validateFindings(v: unknown): Findings {
  const value = v as Findings;
  if (!value || !value.fields) throw new Error("INVALID_REPORT_CONTENT");
  const date = string(value.visit_date, 10);
  if (!validDate(date)) throw new Error("INVALID_REPORT_CONTENT");
  return {
    visit_date: date,
    fields: Object.fromEntries(
      visitFields.map((k) => [k, bi(value.fields[k], 1800)]),
    ) as Findings["fields"],
  };
}
export function validateReport(v: unknown): ReportContent {
  const value = v as ReportContent;
  if (
    !value ||
    !value.fields ||
    !Array.isArray(value.lifestyle) ||
    value.lifestyle.length > 15 ||
    !Array.isArray(value.next_steps) ||
    value.next_steps.length > 10
  )
    throw new Error("INVALID_REPORT_CONTENT");
  const fields = Object.fromEntries(
    visitFields.map((k) => [k, bi(value.fields[k], 1800)]),
  ) as ReportContent["fields"];
  const report = {
    patient_name: string(value.patient_name, 100),
    patient_reference: string(value.patient_reference, 100),
    visit_date: string(value.visit_date, 10),
    clinician_name: string(value.clinician_name, 120),
    clinic_name: string(value.clinic_name, 200),
    clinic_contact: string(value.clinic_contact, 1000),
    fields,
    lifestyle: value.lifestyle.map((c) => ({
      id: string(c.id, 120),
      source_version_id: string(c.source_version_id, 40),
      title: bi(c.title, 160),
      text: bi(c.text, 1600),
    })),
    next_steps: value.next_steps.map((b) => bi(b, 500)),
  };
  if (!validDate(report.visit_date)) throw new Error("INVALID_REPORT_CONTENT");
  return report;
}
export function localizedReport(
  report: ReportContent,
  language: "he" | "en",
): LocalizedReport {
  const value = (b: Bilingual) =>
    b[language] || b[language === "he" ? "en" : "he"];
  return {
    report_title: language === "he" ? "סיכום הביקור" : "Visit Summary",
    next_steps_title:
      language === "he" ? "הצעדים הבאים שלך" : "Your Next Steps",
    labels:
      language === "he"
        ? {
            patient: "שם המטופל",
            reference: "מספר תיק",
            visit_date: "תאריך הביקור",
            clinician: "הרופא המטפל",
            contact: "יצירת קשר עם המרפאה",
          }
        : {
            patient: "Patient",
            reference: "Patient reference",
            visit_date: "Visit date",
            clinician: "Treating clinician",
            contact: "Clinic contact",
          },
    language,
    patient_name: report.patient_name,
    patient_reference: report.patient_reference,
    visit_date: report.visit_date,
    clinician_name: report.clinician_name,
    clinic_name: report.clinic_name,
    clinic_contact: report.clinic_contact,
    sections: [
      ...visitFields
        .filter((k) => value(report.fields[k]))
        .map((k) => ({
          key: k,
          title: fieldLabels[k][language],
          text: value(report.fields[k]),
        })),
      ...report.lifestyle
        .filter((c) => value(c.text))
        .map((c) => ({
          key: "lifestyle:" + c.id,
          title: value(c.title),
          text: value(c.text),
        })),
    ],
    next_steps: report.next_steps.map(value).filter(Boolean),
  };
}
export function approvalReady(report: LocalizedReport) {
  return Boolean(
    report.patient_name &&
    validDate(report.visit_date, true) &&
    report.clinician_name &&
    report.clinic_name &&
    report.clinic_contact &&
    report.sections.length &&
    report.next_steps.length,
  );
}
export function validateLifestyle(
  v: unknown,
  previous?: LifestyleContent,
): LifestyleContent {
  const value = v as LifestyleContent;
  if (!value || !Array.isArray(value.sections) || value.sections.length > 12)
    throw new Error("INVALID_REPORT_CONTENT");
  const sections = value.sections.map((s) => {
    const old = previous?.sections.find((p) => p.id === s.id),
      title = bi(s.title, 160),
      patient_text = bi(s.patient_text, 1600);
    if (
      ![
        "activity",
        "nutrition",
        "habits",
        "monitoring",
        "goals",
        "other",
      ].includes(s.kind)
    )
      throw new Error("INVALID_REPORT_CONTENT");
    return {
      id: string(s.id, 80),
      kind: s.kind,
      title,
      patient_text,
      review_note: old?.review_note || blankBi(),
      requires_clearance: old?.requires_clearance ?? true,
      facts: old?.facts || [],
      refs: old?.refs || [],
      origin: "clinician" as const,
    };
  });
  if (new Set(sections.map((s) => s.id)).size !== sections.length)
    throw new Error("INVALID_REPORT_CONTENT");
  return { sections, limitations: previous?.limitations || [] };
}
export const normalizeRecipient = (v: unknown) => {
  const email = string(v, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INVALID_RECIPIENT");
  return email;
};
