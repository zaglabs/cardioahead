"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Download,
  Eye,
  Pencil,
  FileText,
  Heart,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { AI_FAILURE_MESSAGES } from "@/lib/clinical/errors";
import { HeartLoader } from "./heart-loader";
import { useLanguage } from "./language-provider";
import { useDocumentPreview } from "./document-preview";
import { VisitReportView } from "./visit-report-view";
import {
  blankBi,
  blankFields,
  emptyReport,
  fieldLabels,
} from "@/lib/visit/content";
import {
  visitFields,
  type Approval,
  type Delivery,
  type DraftJob,
  type Findings,
  type LifestyleContent,
  type LocalizedReport,
  type RecordVersion,
  type ReportContent,
} from "@/lib/visit/types";
import type { AppointmentView, Staff } from "@/lib/portal/types";
type Job = Omit<DraftJob, "lease_until"> & { can_retry: boolean };
type Data = {
  heads: {
    findings: RecordVersion | null;
    lifestyle: RecordVersion | null;
    summary: RecordVersion | null;
  };
  candidates: RecordVersion[];
  clinician: boolean;
  ai_configured: boolean;
  email_configured: boolean;
  document_version: string;
  current_approval: Omit<Approval, "pdf_base64"> | null;
  history: {
    id: string;
    kind: string;
    revision: number;
    origin: string;
    created_at: string;
    author_identity: { email: string; role: string };
  }[];
  deliveries: Omit<
    Delivery,
    | "notice_payload"
    | "token_hash"
    | "token_encrypted"
    | "active_attempt_id"
    | "lease_until"
    | "provider_id"
  >[];
  approvals: Omit<Approval, "pdf_base64">[];
  jobs: Job[];
};
type Preview = {
  snapshot: LocalizedReport;
  recipient: string;
  hash: string;
  version: RecordVersion;
  outdated: boolean;
};
export function VisitWorkspace({
  appointment,
  staff,
  mode,
}: {
  appointment: AppointmentView;
  staff: Staff;
  mode: "lifestyle" | "visit";
}) {
  const { language, locale, t } = useLanguage(),
    openPdf = useDocumentPreview();
  const clinician = staff.role === "admin" || staff.role === "professor",
    kind = mode === "visit" ? "summary" : "lifestyle";
  const endpoint = "/api/clinic/appointments/" + appointment.id + "/visit";
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [editLanguage, setEditLanguage] = useState<"he" | "en">(language);
  const [life, setLife] = useState<LifestyleContent>({
      sections: [],
      limitations: [],
    }),
    [report, setReport] = useState<ReportContent>(
      emptyReport(appointment.patient_label),
    );
  const [findings, setFindings] = useState<Findings>({
      visit_date: "",
      fields: blankFields(),
    }),
    [source, setSource] = useState<RecordVersion | null>(null);
  const [dirty, setDirty] = useState(false),
    dirtyRef = useRef(false),
    loaded = useRef("");
  const findingsDirty = useRef(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([]),
    [recipient, setRecipient] = useState(""),
    [reportLanguage, setReportLanguage] = useState<"he" | "en">(language);
  const [preview, setPreview] = useState<Preview | null>(null),
    [reviewed, setReviewed] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [recipientChangeConfirmed, setRecipientChangeConfirmed] = useState(false);
  const [regenerate, setRegenerate] = useState(false),
    [sendTarget, setSendTarget] = useState<{
      approval: Data["current_approval"];
      reissue: boolean;
      previousDeliveryId?: string;
    } | null>(null),
    [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const previewDialog = useRef<HTMLDialogElement>(null),
    regenDialog = useRef<HTMLDialogElement>(null),
    sendDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview) previewDialog.current?.showModal();
    else previewDialog.current?.close();
  }, [preview]);
  useEffect(() => {
    if (regenerate) regenDialog.current?.showModal();
    else regenDialog.current?.close();
  }, [regenerate]);
  useEffect(() => {
    if (sendTarget) sendDialog.current?.showModal();
    else sendDialog.current?.close();
  }, [sendTarget]);
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
    setMessage("");
  };
  const resetDirty = () => {
    dirtyRef.current = false;
    setDirty(false);
  };
  const documentStamp = appointment.documents
    .map((d) => d.id + ":" + d.created_at)
    .join("|");
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" }),
      result = await response.json();
    if (!response.ok) throw new Error(result.message);
    const next = result as Data;
    setData(next);
    const head = next.heads[kind],
      identity = head?.id || "empty";
    if (loaded.current !== identity && !dirtyRef.current) {
      loaded.current = identity;
      setSource(head);
      if (kind === "summary")
        setReport(
          head
            ? (head.data as ReportContent)
            : emptyReport(appointment.patient_label),
        );
      else
        setLife(
          head
            ? (head.data as LifestyleContent)
            : { sections: [], limitations: [] },
        );
    }
    if (next.heads.findings && !findingsDirty.current)
      setFindings(next.heads.findings.data as Findings);
    if (next.current_approval) {
      setRecipient((current) => current || next.current_approval!.recipient);
    }
  }, [endpoint, kind, appointment.patient_label]);
  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((e) => setError(e.message));
  }, [load, documentStamp]);
  const job = data?.jobs.find((j) => j.kind === kind),
    processing = Boolean(job?.status === "processing" && !job.can_retry);
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      3000,
    );
    return () => clearInterval(timer);
  }, [load, processing]);
  const head = data?.heads[kind] || null,
    sourceRecord = source || head;
  const stale = Boolean(
    sourceRecord &&
    (sourceRecord.document_version !== data?.document_version ||
      sourceRecord.source_snapshot.findings_version_id !==
        (data?.heads.findings?.id || null)),
  );
  const sourceChanged = Boolean(
    data?.heads.summary &&
    (data.heads.summary.document_version !== data.document_version ||
      data.heads.summary.source_snapshot.findings_version_id !==
        (data.heads.findings?.id || null)),
  );
  async function api(payload: Record<string, unknown>) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      result = await response.json();
    if (!response.ok) throw new Error(result.message);
    return result;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveCurrent() {
    const result = await api({
      action: kind === "summary" ? "save_summary" : "save_lifestyle",
      baseVersionId: head?.id || null,
      sourceVersionId: sourceRecord?.id || null,
      content: kind === "summary" ? report : life,
    });
    resetDirty();
    loaded.current = "";
    await load();
    setMessage(t("הטיוטה נשמרה כגרסה חדשה."));
    return result.version as RecordVersion;
  }
  async function generate(decision?: "preserve" | "replace") {
    await run(async () => {
      let base = head?.id || null;
      if (dirtyRef.current && decision === "preserve") {
        const saved = await saveCurrent();
        base = saved.id;
      }
      await api({
        action: kind === "summary" ? "generate_summary" : "generate_lifestyle",
        baseVersionId: base,
        decision,
      });
      if (decision === "replace") {
        resetDirty();
        loaded.current = "";
      }
      setRegenerate(false);
      await load();
    });
  }
  function selectVersion(version: RecordVersion) {
    if (
      dirtyRef.current &&
      !window.confirm(t("להחליף את השינויים שלא נשמרו בתצוגת גרסה זו?"))
    )
      return;
    setSource(version);
    if (kind === "summary") setReport(version.data as ReportContent);
    else setLife(version.data as LifestyleContent);
    markDirty();
    setMessage(
      t("גרסה זו מוצגת לבדיקה. שמירה תיצור טיוטה חדשה; ההיסטוריה נשמרת."),
    );
  }
  async function viewHistory(id: string) {
    await run(async () => {
      const response = await fetch(endpoint + "?version=" + id, {
          cache: "no-store",
        }),
        result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (result.selected) selectVersion(result.selected);
    });
  }
  async function preparePreview() {
    await run(async () => {
      const version = dirtyRef.current || !head ? await saveCurrent() : head;
      const result = await api({
        action: "preview",
        versionId: version.id,
        recipient,
        language: reportLanguage,
      });
      setPreview(result);
      setReviewed(false);
      setAcknowledged(false);
      setRecipientChangeConfirmed(false);
    });
  }
  async function approve() {
    if (!preview) return;
    await run(async () => {
      await api({
        action: "approve",
        versionId: preview.version.id,
        recipient: preview.recipient,
        language: preview.snapshot.language,
        previewHash: preview.hash,
        reviewed,
        acknowledgeChanges: acknowledged,
        revokeOtherRecipients: recipientChangeConfirmed,
      });
      setPreview(null);
      await load();
      setMessage(t("הגרסה אושרה. הדוח עדיין לא נשלח."));
    });
  }
  async function send() {
    if (!sendTarget?.approval) return;
    await run(async () => {
      const a = sendTarget.approval!;
      const result = await api({
        action: sendTarget.reissue ? "reissue" : "send",
        approvalId: a.id,
        recipient: a.recipient,
        confirmed: recipientConfirmed,
        deliveryId: sendTarget.previousDeliveryId,
        acknowledgeChanges: acknowledged,
      });
      setSendTarget(null);
      await load();
      setMessage(
        t(
          result.status === "sending"
            ? "השליחה כבר מתבצעת. לא נוצרה שליחה נוספת."
            : "שירות הדוא״ל קיבל את ההודעה. מצב המסירה הסופי מופיע בהיסטוריה.",
        ),
      );
    });
  }
  const date = (s: string) =>
    new Date(s).toLocaleString(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    });
  const reportUrl = (version: string, lang: string, approval?: string) =>
    endpoint +
    "/pdf?" +
    (approval
      ? "approval=" + approval
      : "version=" + version + "&language=" + lang);
  const stateLabels: Record<string, string> = {
    sending: "שליחה מתבצעת",
    accepted: "התקבל בשירות הדוא״ל",
    delivered: "נמסר לפי שירות הדוא״ל",
    failed: "שליחה נכשלה",
    unknown: "שליחה לא אושרה",
    bounced: "המסירה נכשלה",
  };
  const otherRecipients =
    preview &&
    data?.deliveries.some(
      (d) => !d.revoked_at && d.recipient !== preview.recipient,
    );
  const generationControls = data ? (
    <div className="visit-generation">
      <p>
        {t(
          "התוכן נוצר רק לאחר לחיצה על הכנת טיוטה. לחצו כדי לקרוא את המסמכים, להכין הצעה ולבדוק אותה מול המקורות. הטיוטה תישמר לעיון ולעריכת הרופא.",
        )}
      </p>
      <button
        className="button button-dark generate-draft-button"
        disabled={
          busy ||
          processing ||
          !data.ai_configured ||
          !appointment.documents.length ||
          (mode === "visit" && !clinician)
        }
        onClick={() => {
          if (head || dirty) setRegenerate(true);
          else void generate();
        }}
      >
        {busy || processing ? (
          <HeartLoader size={20} />
        ) : (
          <BookOpen size={20} />
        )}
        {t(
          processing
            ? "מכינים טיוטה…"
            : busy
              ? "העיבוד מתבצע…"
              : head
                ? "יצירה מחדש של טיוטה"
                : "הכנת טיוטה בסיוע AI",
        )}
      </button>
      <p className="form-note">
        {t("יצירה מחדש לא תשנה דוח שנשלח או המלצות שכבר הועתקו לסיכום.")}
      </p>
    </div>
  ) : null;
  return (
    <section className="visit-workspace">
      <div className="visit-purpose">
        <ShieldCheck size={21} />
        <p>
          {t(
            mode === "lifestyle"
              ? "טיוטת מניעה ואורח חיים לעיון ולעריכת הרופא. אין שליחה אוטומטית למטופל."
              : "סיכום הביקור יימסר רק לאחר עריכה ואישור מפורש של הגרסה והנמען.",
          )}
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {message && (
        <p className="visit-message" role="status">
          {message}
        </p>
      )}
      {!data && (
        <div className="clinical-loading" role="status">
          <HeartLoader />
          {t("טוענים את סביבת הביקור…")}
        </div>
      )}
      {data && (
        <>
          {generationControls}
          <div className="visit-toolbar">
            <span className="badge">
              {t("טיוטה")} {head && "· " + t("גרסה") + " " + head.revision}
            </span>
            <button
              className="text-button"
              disabled={
                busy || processing || (kind === "summary" && !clinician)
              }
              onClick={() => {
                const control = document.querySelector<HTMLTextAreaElement>(
                  mode === "lifestyle"
                    ? ".lifestyle-editor textarea"
                    : ".patient-report-editor details textarea",
                );
                if (control) {
                  const details = control.closest("details");
                  if (details) details.open = true;
                  control.focus();
                  control.scrollIntoView({
                    block: "center",
                    behavior: "smooth",
                  });
                }
              }}
            >
              <Pencil size={16} />
              {t("עריכה")}
            </button>
            <label>
              {t("שפת העריכה")}
              <select
                value={editLanguage}
                onChange={(e) =>
                  setEditLanguage(e.target.value === "en" ? "en" : "he")
                }
              >
                <option value="he">עברית</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              className="icon-button"
              aria-label={t("רענון הטיוטה")}
              onClick={() => void run(load)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          {stale && (
            <p className="evidence-warning">
              {t(
                "המסמכים או ממצאי הביקור השתנו. יש לבדוק אם הטיוטה זקוקה לעדכון.",
              )}
            </p>
          )}
          {data.history.filter((v) => v.kind === kind).length > 0 && (
            <label className="visit-history">
              {t("גרסאות קודמות")}
              <select
                value={sourceRecord?.id || ""}
                onChange={(e) => void viewHistory(e.target.value)}
              >
                {data.history
                  .filter((v) => v.kind === kind)
                  .map((v) => (
                    <option value={v.id} key={v.id}>
                      {t("גרסה")} {v.revision} · {date(v.created_at)} ·{" "}
                      {v.author_identity.email}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {processing && (
            <div className="visit-processing" role="status">
              <HeartLoader />
              <h3>
                {t(
                  job?.stage === "searching"
                    ? "חיפוש ראיות להמלצות"
                    : job?.stage === "verifying"
                      ? "בדיקת הטיוטה מול המקורות"
                      : job?.stage === "writing"
                        ? "הכנת ניסוח לעיון הרופא"
                        : "קריאת המסמכים וממצאי הביקור",
                )}
              </h3>
              <p>{t("הטיוטה תישמר בתיק. אין אישור או שליחה אוטומטיים.")}</p>
            </div>
          )}
          {job?.can_retry && (
            <p className="form-error">
              {t(
                AI_FAILURE_MESSAGES[job.error_code || ""] ||
                  "הכנת הטיוטה לא הושלמה. הטיוטות הקודמות נשמרו; אפשר לנסות שוב.",
              )}
              {job.error_code && (
                <>
                  <br />
                  <bdi>{job.error_code}</bdi>
                </>
              )}
            </p>
          )}
          {data.candidates
            .filter((v) => v.kind === kind)
            .map((v) => (
              <div className="draft-candidate" key={v.id}>
                <p>
                  {t("נוצרה הצעה חדשה בלי להחליף את הטיוטה הקיימת.")}{" "}
                  {t("גרסה")} {v.revision}
                </p>
                <button
                  className="button button-outline button-small"
                  disabled={busy}
                  onClick={() => selectVersion(v)}
                >
                  {t("בדיקת ההצעה החדשה")}
                </button>
              </div>
            ))}
          {mode === "visit" && (
            <details className="visit-findings">
              <summary>{t("ממצאים שנרשמו על ידי הרופא — מידע פנימי")}</summary>
              <p className="form-note">
                {t(
                  "רק מידע שתועד כאן יכול לתאר בדיקה, שיחה, מסקנה או הסכמה שהתרחשו בביקור.",
                )}
              </p>
              <label>
                {t("תאריך הביקור")}
                <input
                  type="date"
                  value={findings.visit_date}
                  disabled={!clinician || busy}
                  onChange={(e) => {
                    findingsDirty.current = true;
                    setFindings({ ...findings, visit_date: e.target.value });
                  }}
                />
              </label>
              {visitFields.map((k) => (
                <label key={k}>
                  {fieldLabels[k][editLanguage]}
                  <textarea
                    rows={3}
                    maxLength={1800}
                    dir={editLanguage === "he" ? "rtl" : "ltr"}
                    value={findings.fields[k][editLanguage]}
                    disabled={!clinician || busy}
                    onChange={(e) => {
                      findingsDirty.current = true;
                      setFindings({
                        ...findings,
                        fields: {
                          ...findings.fields,
                          [k]: {
                            ...findings.fields[k],
                            [editLanguage]: e.target.value,
                          },
                        },
                      });
                    }}
                  />
                </label>
              ))}
              <button
                className="button button-dark"
                disabled={!clinician || busy || processing}
                onClick={() =>
                  void run(async () => {
                    await api({
                      action: "save_findings",
                      baseVersionId: data.heads.findings?.id || null,
                      content: findings,
                    });
                    findingsDirty.current = false;
                    await load();
                    setMessage(t("ממצאי הביקור נשמרו. הסיכום הקיים לא שונה."));
                  })
                }
              >
                <Save size={17} />
                {t("שמירת ממצאי הביקור")}
              </button>
            </details>
          )}
          {mode === "lifestyle" ? (
            <>
              {!head && !life.sections.length && !processing && (
                <div className="visit-empty">
                  <Heart size={28} />
                  <h3>{t("המלצות מותאמות לעיון הרופא")}</h3>
                  <p>
                    {t(
                      "הכינו טיוטה מבוססת מסמכים וראיות, או הוסיפו תוכן משלכם. הרופא יבחר מה לכלול בסיכום.",
                    )}
                  </p>
                </div>
              )}
              {life.sections.map((section, index) => (
                <article className="lifestyle-editor" key={section.id}>
                  <div className="lifestyle-editor-heading">
                    <label className="recommendation-select">
                      <input
                        type="checkbox"
                        checked={selectedSections.includes(section.id)}
                        onChange={(e) =>
                          setSelectedSections(
                            e.target.checked
                              ? [...selectedSections, section.id]
                              : selectedSections.filter(
                                  (id) => id !== section.id,
                                ),
                          )
                        }
                      />
                      {t("להכללה בסיכום")}
                    </label>
                    <button
                      type="button"
                      className="icon-button danger-text"
                      aria-label={t("הסרת המלצה")}
                      disabled={busy || processing}
                      onClick={() => {
                        setLife({
                          ...life,
                          sections: life.sections.filter((_, i) => i !== index),
                        });
                        markDirty();
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <label>
                    {t("כותרת למטופל")}
                    <input
                      maxLength={160}
                      value={section.title[editLanguage]}
                      dir="auto"
                      disabled={busy || processing}
                      onChange={(e) => {
                        setLife({
                          ...life,
                          sections: life.sections.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  title: {
                                    ...s.title,
                                    [editLanguage]: e.target.value,
                                  },
                                }
                              : s,
                          ),
                        });
                        markDirty();
                      }}
                    />
                  </label>
                  <label>
                    {t("ניסוח למטופל")}
                    <textarea
                      rows={4}
                      maxLength={1600}
                      value={section.patient_text[editLanguage]}
                      dir={editLanguage === "he" ? "rtl" : "ltr"}
                      disabled={busy || processing}
                      onChange={(e) => {
                        setLife({
                          ...life,
                          sections: life.sections.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  patient_text: {
                                    ...s.patient_text,
                                    [editLanguage]: e.target.value,
                                  },
                                }
                              : s,
                          ),
                        });
                        markDirty();
                      }}
                    />
                  </label>
                  <details className="lifestyle-reasoning">
                    <summary>{t("מידע וראיות לעיון הרופא בלבד")}</summary>
                    {section.requires_clearance && (
                      <p className="evidence-warning">
                        {t(
                          "יש לברר התאמה או אישור רפואי לפני מתן הנחיה למטופל.",
                        )}
                      </p>
                    )}
                    <p>{section.review_note[language]}</p>
                    {section.origin === "clinician" && (
                      <p className="form-note">
                        {t(
                          "הניסוח נערך במרפאה. הראיות המקוריות הן הקשר לעיון ואינן אישור אוטומטי לנוסח החדש.",
                        )}
                      </p>
                    )}
                    {section.facts.map((f, i) => (
                      <div className="clinical-fact" key={i}>
                        <p>{f.text[language]}</p>
                        {f.refs.map((r, j) => (
                          <button
                            className="text-button"
                            key={j}
                            onClick={() =>
                              openPdf({
                                id: r.document_id,
                                filename:
                                  sourceRecord?.source_snapshot.documents.find(
                                    (d) => d.document_id === r.document_id,
                                  )?.filename || t("מסמך רפואי"),
                                page: r.page,
                              })
                            }
                          >
                            <FileText size={15} />
                            {t("מקור במסמכים")} · {t("עמוד")} {r.page}
                          </button>
                        ))}
                      </div>
                    ))}
                    {section.refs.map((r, i) => {
                      const found =
                        sourceRecord?.source_snapshot.retrieval?.sources.find(
                          (s) => s.id === r.source_id,
                        );
                      return found ? (
                        <details className="source-evidence" key={i}>
                          <summary>{found.title}</summary>
                          <blockquote dir="auto">{r.quote}</blockquote>
                          <a
                            href={found.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("פתיחת מקור הראיות")}
                          </a>
                        </details>
                      ) : null;
                    })}
                  </details>
                </article>
              ))}
              {life.limitations.map((note, i) => (
                <p className="evidence-warning" key={i}>
                  {note[language]}
                </p>
              ))}
              <button
                className="text-button"
                disabled={busy || processing}
                onClick={() => {
                  setLife({
                    ...life,
                    sections: [
                      ...life.sections,
                      {
                        id: crypto.randomUUID(),
                        kind: "other",
                        title: blankBi(),
                        patient_text: blankBi(),
                        review_note: blankBi(),
                        requires_clearance: true,
                        facts: [],
                        refs: [],
                        origin: "clinician",
                      },
                    ],
                  });
                  markDirty();
                }}
              >
                <Plus size={17} />
                {t("הוספת המלצה")}
              </button>
              <div className="visit-actions">
                <button
                  className="button button-dark"
                  disabled={busy || processing || !dirty}
                  onClick={() =>
                    void run(async () => {
                      await saveCurrent();
                    })
                  }
                >
                  <Save size={17} />
                  {t("שמירת טיוטה")}
                </button>
                <button
                  className="button button-outline"
                  disabled={
                    busy || processing || !clinician || !selectedSections.length
                  }
                  onClick={() =>
                    void run(async () => {
                      const version = dirtyRef.current
                        ? await saveCurrent()
                        : sourceRecord;
                      if (!version) return;
                      await api({
                        action: "include_lifestyle",
                        sourceVersionId: version.id,
                        sectionIds: selectedSections,
                      });
                      await load();
                      setMessage(
                        t(
                          "ההמלצות הועתקו לסיכום. ניתן לערוך אותן שם באופן עצמאי.",
                        ),
                      );
                    })
                  }
                >
                  <Check size={17} />
                  {t("הכללת הנבחרות בסיכום")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="patient-report-editor">
                <h3>{t("פרטי הדוח למטופל")}</h3>
                <div className="report-profile-grid">
                  {(
                    [
                      "patient_name",
                      "patient_reference",
                      "visit_date",
                      "clinician_name",
                      "clinic_name",
                      "clinic_contact",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {t(
                        {
                          patient_name: "שם המטופל בדוח",
                          patient_reference: "מספר תיק — לא חובה",
                          visit_date: "תאריך הביקור",
                          clinician_name: "שם הרופא בדוח",
                          clinic_name: "שם המרפאה",
                          clinic_contact: "פרטי קשר של המרפאה",
                        }[k],
                      )}
                      <input
                        type={k === "visit_date" ? "date" : "text"}
                        dir="auto"
                        value={report[k]}
                        disabled={!clinician || busy || processing}
                        onChange={(e) => {
                          setReport({ ...report, [k]: e.target.value });
                          markDirty();
                        }}
                      />
                    </label>
                  ))}
                </div>
                {visitFields.map((k) => (
                  <details
                    className="report-field"
                    key={k}
                    open={k === "reason"}
                  >
                    <summary>{fieldLabels[k][editLanguage]}</summary>
                    <textarea
                      rows={4}
                      maxLength={1800}
                      aria-label={
                        fieldLabels[k][editLanguage] + " — " + t("נוסח למטופל")
                      }
                      dir={editLanguage === "he" ? "rtl" : "ltr"}
                      value={report.fields[k][editLanguage]}
                      disabled={!clinician || busy || processing}
                      onChange={(e) => {
                        setReport({
                          ...report,
                          fields: {
                            ...report.fields,
                            [k]: {
                              ...report.fields[k],
                              [editLanguage]: e.target.value,
                            },
                          },
                        });
                        markDirty();
                      }}
                    />
                  </details>
                ))}
                {report.lifestyle.map((copy, index) => (
                  <div className="copied-lifestyle" key={copy.id}>
                    <div>
                      <h4>{t("המלצה שהועתקה — עריכה עצמאית")}</h4>
                      <button
                        className="icon-button danger-text"
                        aria-label={t("הסרת המלצה מהסיכום")}
                        disabled={!clinician || busy}
                        onClick={() => {
                          setReport({
                            ...report,
                            lifestyle: report.lifestyle.filter(
                              (_, i) => i !== index,
                            ),
                          });
                          markDirty();
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <input
                      aria-label={t("כותרת המלצה בסיכום")}
                      maxLength={160}
                      value={copy.title[editLanguage]}
                      disabled={!clinician || busy}
                      onChange={(e) => {
                        setReport({
                          ...report,
                          lifestyle: report.lifestyle.map((c, i) =>
                            i === index
                              ? {
                                  ...c,
                                  title: {
                                    ...c.title,
                                    [editLanguage]: e.target.value,
                                  },
                                }
                              : c,
                          ),
                        });
                        markDirty();
                      }}
                    />
                    <textarea
                      aria-label={t("המלצה בסיכום")}
                      rows={3}
                      maxLength={1600}
                      value={copy.text[editLanguage]}
                      dir={editLanguage === "he" ? "rtl" : "ltr"}
                      disabled={!clinician || busy}
                      onChange={(e) => {
                        setReport({
                          ...report,
                          lifestyle: report.lifestyle.map((c, i) =>
                            i === index
                              ? {
                                  ...c,
                                  text: {
                                    ...c.text,
                                    [editLanguage]: e.target.value,
                                  },
                                }
                              : c,
                          ),
                        });
                        markDirty();
                      }}
                    />
                  </div>
                ))}
                <div className="report-steps-editor">
                  <h4>{t("הצעדים הבאים שלך")}</h4>
                  {report.next_steps.map((step, index) => (
                    <div key={index}>
                      <textarea
                        aria-label={t("צעד הבא") + " " + (index + 1)}
                        rows={2}
                        maxLength={500}
                        dir={editLanguage === "he" ? "rtl" : "ltr"}
                        value={step[editLanguage]}
                        disabled={!clinician || busy}
                        onChange={(e) => {
                          setReport({
                            ...report,
                            next_steps: report.next_steps.map((s, i) =>
                              i === index
                                ? { ...s, [editLanguage]: e.target.value }
                                : s,
                            ),
                          });
                          markDirty();
                        }}
                      />
                      <button
                        className="icon-button danger-text"
                        aria-label={t("הסרת צעד")}
                        disabled={!clinician || busy}
                        onClick={() => {
                          setReport({
                            ...report,
                            next_steps: report.next_steps.filter(
                              (_, i) => i !== index,
                            ),
                          });
                          markDirty();
                        }}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    disabled={
                      !clinician || busy || report.next_steps.length >= 10
                    }
                    onClick={() => {
                      setReport({
                        ...report,
                        next_steps: [...report.next_steps, blankBi()],
                      });
                      markDirty();
                    }}
                  >
                    <Plus size={17} />
                    {t("הוספת צעד")}
                  </button>
                </div>
                <button
                  className="button button-dark"
                  disabled={!clinician || busy || processing || !dirty}
                  onClick={() =>
                    void run(async () => {
                      await saveCurrent();
                    })
                  }
                >
                  <Save size={17} />
                  {t("שמירת טיוטה")}
                </button>
              </div>
              <div className="report-review-controls">
                <h3>{t("תצוגה, אישור ושליחה")}</h3>
                <label>
                  {t("דוא״ל הנמען לאימות")}
                  <input
                    type="email"
                    dir="ltr"
                    value={recipient}
                    disabled={!clinician || busy}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                </label>
                <label>
                  {t("שפת הדוח למסירה")}
                  <select
                    value={reportLanguage}
                    disabled={!clinician || busy}
                    onChange={(e) =>
                      setReportLanguage(e.target.value === "en" ? "en" : "he")
                    }
                  >
                    <option value="he">עברית</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <p className="form-note">
                  {t(
                    "התצוגה מציגה את נוסח המטופל בלבד. שינוי בגרסה או בנמען מחייב אישור חדש.",
                  )}
                </p>
                <button
                  className="button button-outline"
                  disabled={!clinician || busy || processing}
                  onClick={() => void preparePreview()}
                >
                  <Eye size={18} />
                  {t("תצוגת המטופל ואישור")}
                </button>
                {data.current_approval &&
                  !dirty &&
                  head?.id === data.current_approval.version_id && (
                    <div className="approved-version">
                      <p>
                        {t("גרסה מאושרת")} {head.revision} ·{" "}
                        {date(data.current_approval.approved_at)} ·{" "}
                        {data.current_approval.approver_identity.email}
                      </p>
                      <p dir="ltr">{data.current_approval.recipient}</p>
                      <button
                        className="button button-dark"
                        disabled={
                          !clinician ||
                          busy ||
                          processing ||
                          !data.email_configured
                        }
                        onClick={() => {
                          setAcknowledged(false);
                          setRecipientConfirmed(false);
                          setSendTarget({
                            approval: data.current_approval,
                            reissue: false,
                          });
                        }}
                      >
                        <Send size={17} />
                        {t("שליחת קישור מאובטח")}
                      </button>
                    </div>
                  )}
                {!data.email_configured && (
                  <p className="form-error">
                    {t(
                      "שירות הדוא״ל אינו מחובר. לא ניתן לשלוח דוח או קוד אימות.",
                    )}
                  </p>
                )}
                {!clinician && (
                  <p className="form-note">
                    {t(
                      "רק רופא או מנהל רשאים לערוך סיכום ביקור, לאשר ולשלוח דוחות.",
                    )}
                  </p>
                )}
              </div>
            </>
          )}
          {mode === "visit" && data.deliveries.length > 0 && (
            <details className="report-delivery-history">
              <summary>{t("אישורים, מסירה וקישורים קודמים")}</summary>
              {data.deliveries.map((d) => {
                const ap = data.approvals.find((a) => a.id === d.approval_id);
                return (
                  <article key={d.id}>
                    <strong>
                      {t(stateLabels[d.status] || stateLabels.unknown)}
                    </strong>
                    <p dir="ltr">{d.recipient}</p>
                    <p>
                      {date(d.created_at)} · {t("ניסיונות")}: {d.attempts}
                    </p>
                    <p>
                      {t(d.revoked_at ? "הקישור בוטל" : "תוקף הקישור")}{" "}
                      {d.revoked_at ? date(d.revoked_at) : date(d.expires_at)}
                    </p>
                    <div className="visit-actions">
                      {ap && (
                        <button
                          className="text-button"
                          onClick={() =>
                            openPdf({
                              id: ap.id,
                              filename: "cardioahead-visit-summary.pdf",
                              url: reportUrl(ap.version_id, ap.language, ap.id),
                            })
                          }
                        >
                          <Download size={16} />
                          {t("העותק המדויק שנמסר")}
                        </button>
                      )}
                      {clinician && !d.revoked_at && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                t(
                                  "לבטל את הגישה לקישור זה? העותק שנשמר במרפאה יישאר בהיסטוריה.",
                                ),
                              )
                            )
                              void run(async () => {
                                await api({
                                  action: "revoke",
                                  deliveryId: d.id,
                                });
                                await load();
                              });
                          }}
                        >
                          {t("ביטול הקישור")}
                        </button>
                      )}
                      {clinician &&
                        ["accepted", "delivered", "bounced"].includes(
                          d.status,
                        ) && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await api({
                                  action: "delivery_status",
                                  deliveryId: d.id,
                                });
                                await load();
                              })
                            }
                          >
                            {t("בדיקת מצב מסירה")}
                          </button>
                        )}
                      {clinician &&
                        data.current_approval?.id === ap?.id &&
                        ap && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => {
                              setAcknowledged(false);
                              setRecipientConfirmed(false);
                              setSendTarget({
                                approval: ap,
                                previousDeliveryId: d.id,
                                reissue:
                                  ["accepted", "delivered", "sending"].includes(
                                    d.status,
                                  ) ||
                                  d.revoked_at !== null ||
                                  d.status === "bounced" ||
                                  Date.parse(d.expires_at) <= Date.now() ||
                                  Date.parse(d.created_at) <
                                    Date.now() - 23 * 3600000,
                              });
                            }}
                          >
                            {t(
                              d.status === "failed" || d.status === "unknown"
                                ? "ניסיון חוזר מבוקר"
                                : "הנפקת קישור חדש",
                            )}
                          </button>
                        )}
                    </div>
                  </article>
                );
              })}
            </details>
          )}
        </>
      )}
      <dialog
        ref={previewDialog}
        className="patient-view-dialog"
        aria-labelledby="patient-preview-title"
        onCancel={() => setPreview(null)}
      >
        {preview && (
          <>
            <div className="patient-view-toolbar">
              <h2 id="patient-preview-title">{t("תצוגת הדוח למטופל")}</h2>
              <button
                className="icon-button"
                aria-label={t("חזרה לעריכה")}
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                <X size={21} />
              </button>
            </div>
            <p className="form-note preview-draft-note">
              {t("תצוגה לפני אישור. הדוח עדיין לא נשלח.")}
            </p>
            <VisitReportView report={preview.snapshot} />
            <div className="patient-preview-approval">
              <p>
                {t("נמען לאישור")}: <bdi>{preview.recipient}</bdi>
              </p>
              <button
                className="text-button"
                onClick={() =>
                  openPdf({
                    id: preview.version.id,
                    filename: "cardioahead-visit-summary.pdf",
                    url: reportUrl(
                      preview.version.id,
                      preview.snapshot.language,
                    ),
                  })
                }
              >
                <FileText size={17} />
                {t("תצוגת PDF")}
              </button>
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                {t(
                  "עיינתי בכל התוכן ובכתובת הנמען, ואני מאשר את הגרסה המדויקת הזו.",
                )}
              </label>
              {preview.outdated && (
                <label className="consent-check">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  {t(
                    "בדקתי את השינויים במסמכים או בממצאים, וגרסה זו עדיין מתאימה למסירה.",
                  )}
                </label>
              )}
              {otherRecipients && (
                <label className="consent-check">
                  <input
                    type="checkbox"
                    checked={recipientChangeConfirmed}
                    onChange={(e) =>
                      setRecipientChangeConfirmed(e.target.checked)
                    }
                  />
                  {t("אני מאשר ביטול קישורים לכתובות קודמות בעת שינוי הנמען.")}
                </label>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {t(error)}
                </p>
              )}
              <div className="visit-actions">
                <button
                  className="button button-dark"
                  disabled={
                    busy ||
                    !reviewed ||
                    (preview.outdated && !acknowledged) ||
                    (Boolean(otherRecipients) && !recipientChangeConfirmed)
                  }
                  onClick={() => void approve()}
                >
                  <Check size={18} />
                  {t("אישור הגרסה — ללא שליחה")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  {t("חזרה לעריכה")}
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
      <dialog
        ref={regenDialog}
        className="management-confirm"
        aria-labelledby="regenerate-title"
        onCancel={() => setRegenerate(false)}
      >
        <div className="patient-panel">
          <h2 id="regenerate-title">{t("כיצד להכין טיוטה חדשה?")}</h2>
          <p>
            {t(
              "הגרסאות השמורות נשארות בהיסטוריה. אפשר לשמור את הטיוטה הערוכה פעילה ולבדוק הצעה חדשה, או להחליף במפורש את הטיוטה הפעילה.",
            )}
          </p>
          <div className="visit-actions">
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void generate("preserve")}
            >
              {t("שמירת הקיימת והכנת הצעה נפרדת")}
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void generate("replace")}
            >
              {t("החלפת הטיוטה הפעילה")}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setRegenerate(false)}
            >
              {t("חזרה")}
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
        </div>
      </dialog>
      <dialog
        ref={sendDialog}
        className="management-confirm"
        aria-labelledby="report-send-title"
        onCancel={() => setSendTarget(null)}
      >
        {sendTarget?.approval && (
          <div className="patient-panel">
            <h2 id="report-send-title">
              {t(
                sendTarget.reissue
                  ? "הנפקת קישור חדש ושליחה"
                  : "אישור שליחת הודעה",
              )}
            </h2>
            <p>
              {t(
                "המטופל יקבל הודעה קצרה עם קישור מאובטח, ללא ממצאים רפואיים בדוא״ל.",
              )}
            </p>
            <strong dir="ltr">{sendTarget.approval.recipient}</strong>
            {sendTarget.reissue && (
              <p>
                {t(
                  "קישור קודם לגרסה זו יבוטל. עותקים שנשמרו בהיסטוריה לא ישתנו.",
                )}
              </p>
            )}
            <label className="consent-check">
              <input
                type="checkbox"
                checked={recipientConfirmed}
                onChange={(e) => setRecipientConfirmed(e.target.checked)}
              />
              {t("בדקתי שזו כתובת הדוא״ל של המטופל המיועד.")}
            </label>
            {sourceChanged && (
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                {t(
                  "בדקתי את השינויים במסמכים או בממצאים, וגרסה זו עדיין מתאימה למסירה.",
                )}
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {t(error)}
              </p>
            )}
            <div className="visit-actions">
              <button
                className="button button-dark"
                disabled={
                  busy ||
                  !recipientConfirmed ||
                  (sourceChanged && !acknowledged)
                }
                onClick={() => void send()}
              >
                <Send size={17} />
                {t("אישור ושליחת הקישור")}
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setSendTarget(null)}
              >
                {t("חזרה")}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
