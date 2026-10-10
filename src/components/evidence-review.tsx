"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  BookOpen,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { AI_FAILURE_MESSAGES } from "@/lib/clinical/errors";
import { useLanguage } from "./language-provider";
import { useDocumentPreview } from "./document-preview";
import type { AppointmentView } from "@/lib/portal/types";
import type {
  EvidenceRecord,
  EvidenceClaim,
  LiteratureSource,
  PatientContext,
} from "@/lib/evidence/types";
import type { ClinicalFact, ClinicalSource } from "@/lib/clinical/types";
type Review = Omit<EvidenceRecord, "lease_until"> & {
  outdated: boolean;
  can_retry: boolean;
};
type Data = {
  configured: boolean;
  document_version: string;
  review: Review | null;
  latest_id: string | null;
  history: {
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    document_version: string;
  }[];
};
const stageLabels = {
  analysing: "ניתוח מסמכי המטופל",
  searching: "חיפוש בספרות הרפואית",
  verifying: "בדיקת המקורות והטענות",
  writing: "כתיבת סקירת הראיות",
  complete: "הסקירה נשמרה",
  failed: "הסקירה לא הושלמה",
};
const sectionLabels = {
  options: "ראיות קליניות ואפשרויות טיפול",
  guidelines: "הנחיות רלוונטיות",
  cases: "מקרים דומים שפורסמו",
  uncertainties: "אי־ודאות ושאלות",
  proposed_plan: "בחינת התכנית המוצעת",
};
const basisLabels = {
  documented: "מידע מתועד",
  patient_reported: "דיווח המטופל",
  interpretation: "פרשנות AI",
};
const sourceTypes = {
  study_protocol: "פרוטוקול מחקר — ללא תוצאות ניסוי מדווחות",
  guideline: "הנחיה מקצועית",
  systematic_review: "סקירה שיטתית / מטא־אנליזה",
  randomized_trial: "מחקר אקראי",
  clinical_trial: "מחקר קליני",
  case_report_or_series: "תיאור מקרה / סדרת מקרים — ראיות מוגבלות",
  preprint: "פרסום מוקדם — ללא ביקורת עמיתים",
  other_peer_reviewed_or_indexed: "פרסום מאונדקס — יש לבדוק את סוג המחקר",
};
const accessLabels = {
  abstract_only: "נקרא תקציר בלבד",
  full_text_excerpts: "נקראו קטעים מהטקסט המלא",
  metadata_only: "פרטי פרסום בלבד — לא שימש לתמיכה בטענות",
};
function PatientReferences({
  fact,
  documents,
}: {
  fact: ClinicalFact;
  documents: ClinicalSource[];
}) {
  const { t } = useLanguage(),
    open = useDocumentPreview();
  return (
    <details className="source-evidence">
      <summary>{t("מקורות במסמכי המטופל")}</summary>
      {fact.refs.map((r, i) => (
        <div key={i}>
          <a
            href={"/api/clinic/documents/" + r.document_id + "#page=" + r.page}
            onClick={(e) => {
              e.preventDefault();
              open({
                id: r.document_id,
                filename:
                  documents.find((d) => d.document_id === r.document_id)
                    ?.filename || t("מסמך רפואי"),
                page: r.page,
              });
            }}
          >
            <FileText size={14} />
            {
              documents.find((d) => d.document_id === r.document_id)?.filename
            } · {t("עמוד")} {r.page}
          </a>
          <blockquote dir="auto">{r.quote}</blockquote>
        </div>
      ))}
    </details>
  );
}
function Claim({
  claim,
  context,
  sources,
}: {
  claim: EvidenceClaim;
  context: PatientContext;
  sources: LiteratureSource[];
}) {
  const { language, t } = useLanguage();
  const stance = {
    support: "ראיות תומכות",
    concern: "שיקולים וחששות",
    alternative: "חלופה לבדיקה",
    question: "שאלה לבירור",
    context: "הקשר קליני",
  };
  return (
    <article className="evidence-claim">
      <span className="evidence-tag">{t(stance[claim.stance])}</span>
      <h4>{claim.title[language]}</h4>
      <p>{claim.text[language]}</p>
      {(claim.recommendation_class || claim.evidence_level) && (
        <p className="form-note">
          {t("דרגת המלצה / רמת ראיות")}: {claim.recommendation_class}{" "}
          {claim.evidence_level}
        </p>
      )}
      {claim.refs.map((r, i) => {
        const source = sources.find((s) => s.id === r.source_id);
        return source ? (
          <details key={i} className="source-evidence literature-evidence">
            <summary>
              {t("ראיות בספרות")}: {source.title}
            </summary>
            <span className="form-note">{t(accessLabels[source.access])}</span>
            <blockquote dir="auto">{r.quote}</blockquote>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {t("פתיחת המקור")}
            </a>
          </details>
        ) : null;
      })}
      {claim.patient_fact_ids.map((id) => {
        const f = context.facts.find((f) => f.id === id);
        return f ? (
          <div className="evidence-patient-link" key={id}>
            <small>
              {t("הקשר למטופל")}: {f.fact.text[language]}
            </small>
            <PatientReferences fact={f.fact} documents={context.documents} />
          </div>
        ) : null;
      })}
    </article>
  );
}
export function EvidenceReview({
  appointment,
}: {
  appointment: AppointmentView;
}) {
  const { language, locale, t } = useLanguage();
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState(""),
    [questionKind, setQuestionKind] = useState<"question" | "plan">("question");
  const formReview = useRef("");
  const documentStamp = appointment.documents
    .map((d) => d.id + ":" + d.created_at)
    .join("|");
  const endpoint = "/api/clinic/appointments/" + appointment.id + "/evidence";
  const load = useCallback(
    async (latest = false) => {
      const response = await fetch(
        endpoint +
          (selected && !latest
            ? "?review=" + encodeURIComponent(selected)
            : ""),
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setData(result);
      setError("");
      if (result.review && formReview.current !== result.review.id) {
        formReview.current = result.review.id;
        setQuestion(result.review.question);
        setQuestionKind(result.review.question_kind);
      }
    },
    [endpoint, selected],
  );
  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((e) => setError(e.message));
  }, [load, documentStamp]);
  const processing = Boolean(
    data?.review?.status === "processing" && !data.review.can_retry,
  );
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      4000,
    );
    return () => clearInterval(timer);
  }, [processing, load]);
  const review = data?.review;

  const date = (s: string | null) =>
    s
      ? new Date(s).toLocaleString(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  async function generate(action: "generate" | "regenerate" | "retry") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          question: action === "retry" && review ? review.question : question,
          questionKind:
            action === "retry" && review ? review.question_kind : questionKind,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setSelected("");
      await load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sections = Object.keys(sectionLabels) as EvidenceClaim["section"][];
  return (
    <section className="evidence-review">
      <div className="evidence-purpose">
        <BookOpen size={21} />
        <p>
          {t(
            "סקירת ראיות בסיוע AI לעיון הרופא. ההחלטות הרפואיות מתקבלות על ידי הרופא המטפל.",
          )}
        </p>
      </div>
      {error && (
        <div className="form-error" role="alert">
          <p>{t(error)}</p>
          <button
            type="button"
            className="text-button"
            onClick={() => void load().catch((e) => setError(e.message))}
          >
            {t("ניסיון חוזר")}
          </button>
        </div>
      )}
      {!data && !error && <p role="status">{t("טוענים את סקירת הראיות…")}</p>}
      {data && (
        <>
          {data.history.length > 1 && (
            <label className="evidence-history">
              {t("סקירות קודמות")}
              <select
                value={selected || data.latest_id || ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.history.map((r) => (
                  <option key={r.id} value={r.id}>
                    {date(r.created_at)} ·{" "}
                    {t(
                      r.status === "ready"
                        ? "נשמרה"
                        : r.status === "failed"
                          ? "לא הושלמה"
                          : "בעיבוד",
                    )}
                  </option>
                ))}
              </select>
            </label>
          )}
          {review && (
            <div className="evidence-dates">
              <span>
                {t("נוצרה")}: {date(review.completed_at || review.created_at)}
              </span>
              <span>
                {t("תאריך חיפוש")}: {date(review.searched_at)}
              </span>
              <span
                className={
                  review.outdated ? "evidence-stale" : "evidence-current"
                }
              >
                {t(
                  review.outdated
                    ? "המסמכים השתנו — ייתכן שהסקירה אינה עדכנית"
                    : "משקפת את גרסת המסמכים הנוכחית",
                )}
              </span>
            </div>
          )}
          {processing && (
            <div className="evidence-progress" role="status" aria-live="polite">
              <LoaderCircle size={28} className="evidence-spinner" />
              <h3>{t(stageLabels[review!.stage])}</h3>
              <p>{t("העיבוד נמשך ברקע. הסקירה תישמר בתיק המטופל.")}</p>
              <ol>
                {(
                  ["analysing", "searching", "verifying", "writing"] as const
                ).map((stage) => (
                  <li
                    key={stage}
                    className={review?.stage === stage ? "active" : ""}
                  >
                    {t(stageLabels[stage])}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {review && (review.status === "failed" || review.can_retry) && (
            <div className="form-error" role="alert">
              <p>
                {t(
                  (review.error_code &&
                    AI_FAILURE_MESSAGES[review.error_code]) ||
                    (review.error_code === "EVIDENCE_VERIFICATION_FAILED"
                      ? "בדיקת התמיכה במקורות לא הושלמה. לא הוצגה סקירה לא מאומתת; אפשר לנסות שוב."
                      : review.error_code === "JOB_EXPIRED"
                        ? "זמן העיבוד הסתיים לפני שהסקירה הושלמה. אפשר לנסות שוב."
                        : review.error_code === "INVALID_EVIDENCE_OUTPUT"
                          ? "טיוטת סקירת הראיות לא עמדה במבנה הנדרש. אפשר לנסות שוב."
                          : review.error_code === "TEST_DOCUMENT_ONLY"
                            ? "שלב הבדיקה מאפשר רק את מסמכי הבדיקה הפיקטיביים."
                            : "סקירת הראיות לא הושלמה. אפשר לנסות שוב; סקירות קודמות נשמרו."),
                )}
              </p>
              {review.error_code && (
                <p className="form-note">
                  <bdi>{review.error_code}</bdi>
                </p>
              )}
              {review.error_code === "EVIDENCE_FAILED" && (
                <p>
                  {t(
                    "בניסיון הישן לא נשמר פירוט הסיבה. ניסיון חוזר יציג אבחון מדויק יותר במקרה של כשל.",
                  )}
                </p>
              )}
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => void generate("retry")}
              >
                <RefreshCw size={17} />
                {t("ניסיון חוזר לסקירה")}
              </button>
            </div>
          )}
          {review?.status === "ready" && review.context && review.report && (
            <>
              {review.report.incomplete && (
                <div className="evidence-warning" role="status">
                  <strong>{t("סקירה חלקית")}</strong>
                  <p>
                    {t(
                      "חלק מהחיפושים או מבדיקות התמיכה בטענות לא הושלמו. יש לעיין במגבלות ובמקורות.",
                    )}
                  </p>
                  {review.report.omitted_patient_facts > 0 && (
                    <p>
                      {t("ממצאים שלא אומתו מול מסמכי המקור הושמטו")}:{" "}
                      {review.report.omitted_patient_facts}
                    </p>
                  )}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void generate("retry")}
                  >
                    {t("ניסיון חוזר לסקירה")}
                  </button>
                  {review.report.omitted_claims > 0 && (
                    <p>
                      {t("טענות שלא עברו בדיקת תמיכה הושמטו")}:{" "}
                      {review.report.omitted_claims}
                    </p>
                  )}
                </div>
              )}
              <div className="evidence-overview">
                <span className="eyebrow">{t("תמצית המקרה")}</span>
                <h3>{t("מבט קליני קצר")}</h3>
                <span className="evidence-tag">{t("פרשנות AI")}</span>
                <p>{review.context.summary.overview.text[language]}</p>
                <PatientReferences
                  fact={review.context.summary.overview}
                  documents={review.context.documents}
                />
                {review.question && (
                  <div className="evidence-question">
                    <strong>
                      {t(
                        review.question_kind === "plan"
                          ? "התכנית שהוזנה לבחינה"
                          : "השאלה הקלינית",
                      )}
                    </strong>
                    <p dir="auto">{review.question}</p>
                  </div>
                )}
              </div>
              <details className="evidence-section">
                <summary>{t("סקירת המקרה והמידע החסר")}</summary>
                {review.context.summary.sections.map((section) => (
                  <div className="evidence-case-section" key={section.kind}>
                    <h4>{section.title[language]}</h4>
                    {review
                      .context!.facts.filter((f) => f.kind === section.kind)
                      .map((f) => (
                        <div key={f.id}>
                          <span className="evidence-tag">
                            {t(basisLabels[f.basis])}
                          </span>
                          <p>{f.fact.text[language]}</p>
                          <PatientReferences
                            fact={f.fact}
                            documents={review.context!.documents}
                          />
                        </div>
                      ))}
                    {section.missing.length > 0 && (
                      <>
                        <strong className="evidence-gap-label">
                          {t("מידע חסר על המטופל")}
                        </strong>
                        <ul>
                          {section.missing.map((m, i) => (
                            <li key={i}>{m[language]}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ))}
                {review.context.summary.conflicts.length > 0 && (
                  <div className="evidence-case-section">
                    <h4>{t("מידע סותר במסמכים")}</h4>
                    {review.context.summary.conflicts.map((f, i) => (
                      <div key={i}>
                        <p>{f.text[language]}</p>
                        <PatientReferences
                          fact={f}
                          documents={review.context!.documents}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </details>
              {sections
                .filter(
                  (section) =>
                    section !== "proposed_plan" ||
                    (review.question_kind === "plan" && review.question),
                )
                .map((section) => {
                  const claims = review.report!.claims.filter(
                    (c) => c.section === section,
                  );
                  return (
                    <details
                      key={section}
                      className="evidence-section"
                      open={section === "options"}
                    >
                      <summary>
                        {t(sectionLabels[section])}
                        <span>{claims.length}</span>
                      </summary>
                      {section === "proposed_plan" ? (
                        <>
                          {(
                            [
                              "support",
                              "concern",
                              "alternative",
                              "question",
                            ] as const
                          ).map((stance) => (
                            <div className="evidence-plan-group" key={stance}>
                              <h4>
                                {t(
                                  {
                                    support: "ראיות תומכות",
                                    concern: "חששות אפשריים",
                                    alternative: "חלופות",
                                    question: "שאלות פתוחות",
                                  }[stance],
                                )}
                              </h4>
                              {claims.filter((c) => c.stance === stance)
                                .length ? (
                                claims
                                  .filter((c) => c.stance === stance)
                                  .map((c, i) => (
                                    <Claim
                                      key={i}
                                      claim={c}
                                      context={review.context!}
                                      sources={review.retrieval?.sources || []}
                                    />
                                  ))
                              ) : stance === "question" &&
                                review.context!.summary.questions.length ? (
                                <ul>
                                  {review.context!.summary.questions.map(
                                    (q, i) => (
                                      <li key={i}>{q[language]}</li>
                                    ),
                                  )}
                                </ul>
                              ) : (
                                <p className="evidence-no-results">
                                  {t(
                                    "לא נמצאו טענות נוספות עם תמיכה מספקת. יש לעיין במידע החסר ובמגבלות החיפוש.",
                                  )}
                                </p>
                              )}
                            </div>
                          ))}
                          {claims
                            .filter((c) => c.stance === "context")
                            .map((c, i) => (
                              <Claim
                                key={i}
                                claim={c}
                                context={review.context!}
                                sources={review.retrieval?.sources || []}
                              />
                            ))}
                        </>
                      ) : claims.length ? (
                        claims.map((c, i) => (
                          <Claim
                            key={i}
                            claim={c}
                            context={review.context!}
                            sources={review.retrieval?.sources || []}
                          />
                        ))
                      ) : (
                        <p className="evidence-no-results">
                          {t(
                            section === "cases"
                              ? "לא נמצאו מקרים דומים עם ראיות מספקות שניתן לאמת."
                              : section === "guidelines"
                                ? "לא אומתה המלצת הנחיה רלוונטית בטקסט הזמין."
                                : "לא נמצאו טענות נוספות עם תמיכה מספקת. יש לעיין במידע החסר ובמגבלות החיפוש.",
                          )}
                        </p>
                      )}
                      {section === "uncertainties" && (
                        <>
                          <h4>{t("שאלות לבירור בביקור")}</h4>
                          <ul>
                            {review.context!.summary.questions.map((q, i) => (
                              <li key={i}>{q[language]}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </details>
                  );
                })}
              <details className="evidence-section">
                <summary>
                  {t("מקורות ומגבלות החיפוש")}
                  <span>{review.retrieval?.sources.length || 0}</span>
                </summary>
                <p className="evidence-search-note">
                  {t(
                    "החיפוש ממוקד ואינו ממצה. טקסט מלא שאינו נגיש לא נקרא; קטעים שנשלפו אינם סקירה של המאמר כולו. יש לבדוק עדכונים ומידת התאמה למטופל.",
                  )}
                </p>
                {review.retrieval?.limitations.map((l, i) => (
                  <p className="evidence-warning" key={i}>
                    {t(
                      l.startsWith("LATEST_GUIDELINE_TEXT_UNAVAILABLE")
                        ? "נמצאה הנחיה חדשה יותר, אך הטקסט התומך בהמלצות לא היה נגיש. יש לבדוק את ההנחיה המקורית לפני הסתמכות על הנחיות ישנות יותר."
                        : l.startsWith("FULL_TEXT_UNAVAILABLE")
                          ? "הטקסט המלא לא היה זמין; מקור זה נבדק לפי התקציר בלבד."
                          : l === "NO_GUIDELINE_RETRIEVED"
                            ? "לא נמצאה הנחיה מקצועית רלוונטית בחיפוש זה."
                            : l === "NO_SAFE_SEARCH_TERMS"
                              ? "לא זוהו מונחי חיפוש קליניים בטוחים. יש להשלים את המידע הקליני."
                              : l === "SEARCH_INCOMPLETE"
                                ? "חלק מהחיפושים נכשלו — סקירת הראיות אינה מלאה."
                                : "לא נמצאו ראיות רלוונטיות נגישות במידה מספקת.",
                    )}
                  </p>
                ))}
                {review.retrieval?.sources.map((source) => (
                  <article className="evidence-source" key={source.id}>
                    <span className="evidence-tag">
                      {t(
                        sourceTypes[
                          source.evidence_type as keyof typeof sourceTypes
                        ] || sourceTypes.other_peer_reviewed_or_indexed,
                      )}
                    </span>
                    <h4>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                      </a>
                    </h4>
                    <p dir="auto">{source.authors.join(", ")}</p>
                    <p>
                      {source.journal}{" "}
                      {source.organisation && "· " + source.organisation} ·{" "}
                      {source.date || t("תאריך פרסום לא זמין")}
                    </p>
                    <p className="form-note">
                      {source.organisation} {source.date} ·{" "}
                      {t(accessLabels[source.access])} · {t("נשלף")}:{" "}
                      {date(source.retrieved_at)}
                    </p>
                    <p className="form-note">
                      {t("התאמה לחיפוש")}:{" "}
                      {source.topics
                        .map((topic) => topic.replaceAll("_", " "))
                        .join(", ")}
                    </p>
                    {source.doi_url && (
                      <a
                        className="text-link"
                        href={source.doi_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("עמוד המפרסם / DOI")}
                      </a>
                    )}
                    {source.text && (
                      <details className="source-evidence">
                        <summary>{t("הטקסט שנשלף ונבדק")}</summary>
                        <p className="retrieved-text" dir="auto">
                          {source.text}
                        </p>
                      </details>
                    )}
                  </article>
                ))}
                <details className="source-evidence evidence-search-log">
                  <summary>{t("תיעוד החיפושים")}</summary>
                  {review.retrieval?.searches.map((search, i) => (
                    <div key={i}>
                      <strong>{search.database}</strong>
                      <code dir="ltr">{search.query}</code>
                      <p>
                        {date(search.retrieved_at)} · {t("תוצאות")}:{" "}
                        {search.count}{" "}
                        {search.failure &&
                          "· " + t("החיפוש נכשל") + " (" + search.failure + ")"}
                      </p>
                    </div>
                  ))}
                </details>
                <p className="form-note">
                  {t(
                    "בדיקת התמיכה נעשתה בסיוע AI ואינה מחליפה עיון רופא במסמכים ובמקורות המקוריים.",
                  )}
                </p>
              </details>
            </>
          )}
          {!review && (
            <div className="evidence-empty">
              <Search size={30} />
              <h3>{t("סקירת ראיות ממוקדת במטופל")}</h3>
              <p>
                {t(
                  "חיפוש בספרות, בדיקת חלופות ואי־ודאות, עם הפניות למסמכים ולמקורות. הסקירה נוצרת רק לפי בקשת הרופא.",
                )}
              </p>
            </div>
          )}
          {!processing && (
            <details className="evidence-request" open={!review}>
              <summary>
                {t(
                  review
                    ? "יצירת סקירה חדשה"
                    : "שאלה קלינית או תכנית לבחינה — לא חובה",
                )}
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void generate(review ? "regenerate" : "generate");
                }}
              >
                <label>
                  {t("סוג הבקשה")}
                  <select
                    value={questionKind}
                    onChange={(e) =>
                      setQuestionKind(
                        e.target.value === "plan" ? "plan" : "question",
                      )
                    }
                  >
                    <option value="question">{t("שאלה קלינית")}</option>
                    <option value="plan">{t("תכנית טיפול מוצעת")}</option>
                  </select>
                </label>
                <label>
                  {t("מה תרצו לבחון?")}
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={t(
                      "אפשר להשאיר ריק ולסקור את הראיות לפי המסמכים.",
                    )}
                  />
                </label>
                <p className="form-note">
                  {t(
                    "הבקשה נשמרת באופן פרטי במרפאה. לחיפוש הציבורי נשלחים רק מונחים קליניים מבוקרים, ללא שמות, פרטי קשר או המסמכים עצמם.",
                  )}
                </p>
                {!appointment.documents.length && (
                  <p>{t("העלו מסמכים לפני יצירת סקירת ראיות.")}</p>
                )}
                {!data.configured && (
                  <p className="form-error">
                    {t("עיבוד המסמכים באמצעות שירות AI ממתין לחיבור ולאישור.")}
                  </p>
                )}
                <button
                  className="button button-dark"
                  disabled={
                    busy || !data.configured || !appointment.documents.length
                  }
                >
                  <BookOpen size={18} />
                  {t(
                    busy
                      ? "מתחילים את הסקירה…"
                      : review
                        ? "יצירה מחדש של סקירת ראיות"
                        : "יצירת סקירת ראיות",
                  )}
                </button>
              </form>
            </details>
          )}
          {review?.outdated && !processing && (
            <button
              type="button"
              className="button button-outline evidence-regenerate"
              disabled={busy}
              onClick={() => {
                setQuestion(review.question);
                setQuestionKind(review.question_kind);
                void generate("retry");
              }}
            >
              <RefreshCw size={17} />
              {t("יצירת סקירה לפי המסמכים החדשים")}
            </button>
          )}
        </>
      )}
      <p className="evidence-private-note">
        <ShieldCheck size={16} />
        {t("לצוות הרפואי בלבד. סקירה זו אינה זמינה בקישור ההזמנה למטופל.")}
      </p>
    </section>
  );
}
