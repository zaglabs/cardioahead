"use client";
import { AI_FAILURE_MESSAGES } from "@/lib/clinical/errors";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Heart,
  LoaderCircle,
  CheckCircle2,
  Presentation,
  RefreshCw,
} from "lucide-react";
import { useLanguage } from "./language-provider";
import { PresentationViewer } from "./presentation-viewer";
import type { AppointmentView, Staff } from "@/lib/portal/types";
import type {
  AnalysisRecord,
  ClinicalFact,
  ClinicalSource,
  PresentationRecord,
} from "@/lib/clinical/types";
type Response = {
  analysis: Omit<
    AnalysisRecord,
    "lease_token" | "lease_until" | "source_hash"
  > | null;
  presentation: PresentationRecord | null;
  configured: boolean;
  can_resume: boolean;
};
function EvidenceFact({
  fact,
  sources,
}: {
  fact: ClinicalFact;
  sources: ClinicalSource[];
}) {
  const { language, t } = useLanguage();
  return (
    <li className="clinical-fact">
      <p>{fact.text[language]}</p>
      {fact.date && <span className="fact-date">{fact.date}</span>}
      <details className="source-evidence">
        <summary>
          {t("מקורות")} · {fact.refs.length}
        </summary>
        {fact.refs.map((ref, i) => (
          <div key={i}>
            <a
              href={
                "/api/clinic/documents/" + ref.document_id + "#page=" + ref.page
              }
              target="_blank"
              rel="noreferrer"
            >
              {sources.find((s) => s.document_id === ref.document_id)?.filename}{" "}
              · {t("עמוד")} {ref.page}
            </a>
            <blockquote dir="auto">{ref.quote}</blockquote>
          </div>
        ))}
      </details>
    </li>
  );
}
export function ClinicalInsights({
  appointment,
  staff,
  mode,
}: {
  appointment: AppointmentView;
  staff: Staff;
  mode: "report" | "presentation";
}) {
  const { language, locale, t } = useLanguage();
  const [data, setData] = useState<Response | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = "/api/clinic/appointments/" + appointment.id + "/analysis";
  const clinician = staff.role === "admin" || staff.role === "professor";
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    setData(result as Response);
    return result as Response;
  }, [endpoint]);
  useEffect(() => {
    let alive = true,
      started = false;
    async function update() {
      try {
        const result = await load();
        if (!alive) return;
        if (
          result.configured &&
          appointment.status !== "invited" &&
          (!result.analysis ||
            result.analysis.status === "queued" ||
            result.can_resume) &&
          (!started || result.can_resume)
        ) {
          started = true;
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
          });
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    void update();
    const timer = setInterval(() => void update(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load, endpoint, appointment.status]);
  async function action(action: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const summary = data?.analysis?.summary;
  const sources = data?.analysis?.sources || [];
  const preparing = Boolean(
    data?.configured &&
    appointment.status !== "invited" &&
    !summary &&
    !error &&
    (!data.analysis || data.analysis.status === "queued" || data.analysis.status === "generating"),
  );
  const queued = data?.analysis?.status !== "generating";
  return (
    <section className="clinical-insights">
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      {!data && !error && (
        <div className="clinical-loading">
          <LoaderCircle className="spin" size={24} />
          {t("טוענים את תיק הסיכום…")}
        </div>
      )}
      {data && !summary && (
        <div className="empty-report" aria-busy={preparing}>
          <Heart size={30} className={preparing ? "summary-heart-loader" : undefined} aria-hidden="true" />
          <h3 aria-live="polite">
            {data.analysis?.status === "failed"
              ? t("הכנת הסיכום נכשלה.")
              : appointment.status === "invited"
                ? t("ממתינים לשליחת המסמכים.")
                : data.configured
                  ? queued ? t("הסיכום ממתין לתחילת העיבוד.") : t("מכינים את הסיכום מהמסמכים.")
                  : t("חיבור קורא המסמכים נדרש.")}
          </h3>
          <p>
            {data.analysis?.status === "failed"
              ? t("אפשר לנסות שוב לאחר תיקון החיבור.")
              : appointment.status === "invited"
                ? t("הסיכום יוכן לאחר שהמטופל ישלח את המסמכים למרפאה.")
                : data.configured
                  ? queued ? t("הבקשה התקבלה ותתחיל בקרוב. המצב מתעדכן אוטומטית.") : t(
                      "הקבצים נקראים ונשמרת טיוטה עם הפניות למקורות. אין צורך להישאר בעמוד.",
                    )
                  : t("עיבוד המסמכים באמצעות שירות AI ממתין לחיבור ולאישור.")}
          </p>
          {data.analysis?.status === "failed" && (
            <>
              <p className="form-error">
                {t(
                  AI_FAILURE_MESSAGES[data.analysis.error_code || ""] ||
                    "הכנת הסיכום לא הושלמה. בדקו את חיבור השירות ונסו שוב בעוד דקה.",
                )}
              </p>
              <button
                className="button button-dark"
                disabled={busy || data.analysis.attempts >= 3}
                onClick={() => void action("start")}
              >
                <RefreshCw size={17} />
                {t("ניסיון נוסף להכנת הסיכום")}
              </button>
            </>
          )}
        </div>
      )}
      {summary && data?.analysis && mode === "report" && (
        <>
          <div className="clinical-report-heading">
            <span className="eyebrow">{t("לפרופ׳ אלעד מאור")}</span>
            <h3>{t("סיכום לקראת הביקור")}</h3>
            <div className="artifact-meta">
              <span
                className={
                  data.analysis.reviewed_at ? "reviewed-label" : "draft-label"
                }
              >
                {data.analysis.reviewed_at
                  ? t("נבדק על ידי רופא / מנהל")
                  : t("טיוטת AI לעיון הרופא")}
              </span>
              <span>
                {sources.length} {t("מסמכי מקור")}
              </span>
              {data.analysis.completed_at && (
                <time>
                  {new Date(data.analysis.completed_at).toLocaleString(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              )}
            </div>
          </div>
          <p className="clinical-format-note">
            {t(
              "מבנה זמני עד לקבלת תבנית פרופ׳ מאור. בדקו את המקורות, הנתונים וההמלצות לפני שימוש קליני.",
            )}
          </p>
          <ul className="clinical-overview">
            <EvidenceFact fact={summary.overview} sources={sources} />
          </ul>
          <div className="clinical-sections">
            {summary.sections.map((section) => (
              <article key={section.kind}>
                <h4>{section.title[language]}</h4>
                <ul>
                  {section.items.map((fact, i) => (
                    <EvidenceFact key={i} fact={fact} sources={sources} />
                  ))}
                </ul>
                {section.missing.map((text, i) => (
                  <p className="missing-information" key={i}>
                    {text[language]}
                  </p>
                ))}
              </article>
            ))}
          </div>
          {summary.conflicts.length > 0 && (
            <article className="clinical-questions">
              <h4>{t("מידע סותר לבדיקה")}</h4>
              <ul>
                {summary.conflicts.map((fact, i) => (
                  <EvidenceFact key={i} fact={fact} sources={sources} />
                ))}
              </ul>
            </article>
          )}
          <article className="clinical-questions">
            <h4>{t("שאלות לקראת הפגישה")}</h4>
            <ul>
              {summary.questions.map((q, i) => (
                <li key={i}>{q[language]}</li>
              ))}
            </ul>
          </article>
          <div className="clinical-limitations">
            {summary.limitations.map((s, i) => (
              <p key={i}>{s[language]}</p>
            ))}
          </div>
          {clinician && !data.analysis.reviewed_at && (
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void action("review_summary")}
            >
              <CheckCircle2 size={17} />
              {t("סימון הסיכום כנבדק")}
            </button>
          )}
        </>
      )}
      {summary && mode === "presentation" && (
        <>
          {data?.presentation ? (
            <>
              <PresentationViewer record={data.presentation} />
              <div className="saved-presentation-note">
                <CheckCircle2 size={20} />
                <p>
                  {t("המצגת נשמרה בתיק ותיפתח שוב ללא יצירה מחדש.")}
                  <br />
                  {new Date(data.presentation.created_at).toLocaleString(
                    locale,
                    { dateStyle: "medium", timeStyle: "short" },
                  )}
                </p>
              </div>
              {clinician && !data.presentation.reviewed_at && (
                <button
                  className="button button-dark"
                  disabled={busy}
                  onClick={() => void action("review_presentation")}
                >
                  {t("סימון המצגת כנבדקה לשיחה עם המטופל")}
                </button>
              )}
              <span className="artifact-meta">
                {data.presentation.reviewed_at
                  ? t("נבדק על ידי רופא / מנהל")
                  : t("טיוטת AI לעיון הרופא")}
              </span>
            </>
          ) : (
            <div className="presentation-proposal">
              <span className="eyebrow">
                {t("הצעה לפרופ׳ מאור — טרם נוצרה מצגת")}
              </span>
              <h3>
                {summary.presentation.eligible
                  ? t("אפשר להכין הסבר חזותי מהמסמכים.")
                  : t("אין עדיין בסיס מספק למצגת חזותית.")}
              </h3>
              <p>{summary.presentation.reason[language]}</p>
              {summary.presentation.eligible && (
                <>
                  <h4>{t("מה המצגת תציג")}</h4>
                  <ol>
                    {summary.presentation.slides.map((slide, i) => (
                      <li key={i}>
                        <span>{i + 1}</span>
                        <div>
                          <strong>{slide.title[language]}</strong>
                          <p>{slide.explanation[language]}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="clinical-format-note">
                    {t(
                      "תוצג המחשה סכמטית בלבד. אפשרויות טיפול יוצגו לפי התיעוד, לא כהמלצה חדשה. המצגת תישמר רק לאחר לחיצה על הכפתור.",
                    )}
                  </p>
                  <button
                    className="button button-dark"
                    disabled={busy || !clinician}
                    onClick={() => void action("create_presentation")}
                  >
                    <Presentation size={18} />
                    {busy ? t("יוצרים ושומרים את המצגת…") : t("יצירת מצגת")}
                  </button>
                  {!clinician && (
                    <p className="form-note">
                      {t("יצירת מצגת ואישור תוכן זמינים לרופא או למנהל בלבד.")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
      {data?.analysis?.status === "ready" && (
        <div className="clinical-source-list">
          <h4>
            <FileText size={17} />
            {t("המסמכים שנקראו")}
          </h4>
          {sources.map((source) => (
            <a
              key={source.document_id}
              href={"/api/clinic/documents/" + source.document_id}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={16} />
              <span dir="auto">{source.filename}</span>
              <small>
                {source.pages} {t("עמודים")}
              </small>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
