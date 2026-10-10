"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link2,
  BookOpen,
  CheckCircle2,
  RefreshCw,
  X,
  Heart,
  Eye,
} from "lucide-react";
import { useLanguage } from "./language-provider";
import { HeartLoader } from "./heart-loader";
import { ClinicalScene } from "./clinical-scene";
import {
  useIllustrationMotion,
  useReducedMotion,
} from "./use-illustration-motion";
import { medicalVisualFocus } from "@/lib/medical-import/visual";
import { isAdmin } from "@/lib/portal/staff-access";
import type { AppointmentView, Staff } from "@/lib/portal/types";
import type { MedicalImport } from "@/lib/medical-import/types";
import type {
  MedicalFact,
  MedicalRecord,
  MedicalSlide,
  MedicalBundle,
} from "@/lib/medical-import/schema.mjs";
const categoryNames: Record<string, { he: string; en: string }> = {
  medical_summary: { he: "סיכום רפואי", en: "Medical summary" },
  laboratory: { he: "מעבדה", en: "Laboratory" },
  visits: { he: "ביקורים", en: "Visits" },
  hospitalizations: { he: "אשפוזים", en: "Hospitalizations" },
  diagnoses: { he: "אבחנות", en: "Diagnoses" },
  medications: { he: "תרופות", en: "Medications" },
  allergies: { he: "רגישויות", en: "Allergies" },
  imaging: { he: "דימות", en: "Imaging" },
  vaccinations: { he: "חיסונים", en: "Vaccinations" },
  measurements: { he: "מדדים", en: "Measurements" },
  procedures: { he: "פעולות", en: "Procedures" },
  other: { he: "מקור נוסף", en: "Other source" },
};
function MedicalVisual({
  slides,
  bundle,
}: {
  slides: MedicalSlide[];
  bundle: MedicalBundle;
}) {
  const { language } = useLanguage();
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(true);
  const reduced = useReducedMotion();
  const slide = slides[index];
  const focus = medicalVisualFocus(slide, bundle);
  const { progress } = useIllustrationMotion(
    playing && !reduced && focus?.mode === "comparison",
    1,
  );
  if (!slide) return null;
  return (
    <div className="presentation-viewer">
      <div className="presentation-toolbar">
        <span>
          {language === "he"
            ? "הסבר חזותי שמור בתיק"
            : "Visual Explanation saved in the record"}{" "}
          · {index + 1}/{slides.length}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={() => setPlaying(!playing)}
          aria-label={language === "he" ? "הפעלה או עצירה" : "Play or pause"}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
      </div>
      <div className="presentation-stage">
        <div className="presentation-narrative">
          <span className="eyebrow">
            {language === "he"
              ? "להצגה בהנחיית הרופא במהלך הייעוץ"
              : "For the doctor to show during the consultation"}
          </span>
          <h3>{slide.title[language]}</h3>
          <p>{slide.explanation[language]}</p>
          {slide.bullets.map((fact, i) => (
            <p key={i}>{fact.text[language]}</p>
          ))}
        </div>
        {focus && (
          <div className="medical-visual-pair">
            <div>
              <p>
                {language === "he"
                  ? "לב ייחוס — המחשה סכמטית"
                  : "Reference heart — schematic"}
              </p>
              <ClinicalScene
                kind={slide.kind}
                progress={progress}
                intervention={false}
                focus={focus.area}
                compact
              />
            </div>
            <div>
              <p>
                {language === "he"
                  ? "האזור הנתמך במקורות המטופל"
                  : "Affected area supported by the patient’s sources"}
              </p>
              <ClinicalScene
                kind={slide.kind}
                progress={progress}
                intervention={false}
                focus={focus.area}
                patient
                locationOnly={focus.mode === "location"}
                compact
              />
            </div>
          </div>
        )}
      </div>
      <div className="presentation-toolbar">
        <button
          type="button"
          className="secondary-button"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          {language === "he" ? "הקודם" : "Previous"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={index === slides.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          {language === "he" ? "הבא" : "Next"}
        </button>
      </div>
    </div>
  );
}
export function MedicalRecords({
  appointment,
  staff,
  mode,
  onChanged,
}: {
  appointment: AppointmentView;
  staff: Staff;
  mode: "sources" | "report" | "presentation";
  onChanged?: () => void;
}) {
  const { language, locale } = useLanguage();
  const w = (he: string, en: string) => (language === "he" ? he : en);
  const [record, setRecord] = useState<MedicalImport | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [setup, setSetup] = useState(false),
    [claude, setClaude] = useState(true),
    [own, setOwn] = useState(false),
    [connection, setConnection] = useState(""),
    [preview, setPreview] = useState<MedicalRecord | null>(null),
    [needsRecollection, setNeedsRecollection] = useState(false),
    [configured, setConfigured] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const endpoint =
    "/api/clinic/appointments/" + appointment.id + "/medical-records";
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    setRecord((previous) =>
      previous?.id === data.record?.id &&
      previous?.status === data.record?.status &&
      previous?.reviewed_at === data.record?.reviewed_at &&
      previous?.visual_created_at === data.record?.visual_created_at &&
      JSON.stringify(previous?.review_overrides) ===
        JSON.stringify(data.record?.review_overrides)
        ? previous
        : data.record,
    );
    setConfigured(Boolean(data.configured));
    setNeedsRecollection(Boolean(data.needs_recollection));
    setLoading(false);
    if (data.record && !appointment.personal_import_source) onChanged?.();
  }, [endpoint, onChanged, appointment.personal_import_source]);
  useEffect(() => {
    let alive = true;
    const update = async () => {
      try {
        await load();
      } catch (error) {
        if (alive) {
          setError((error as Error).message);
          setLoading(false);
        }
      }
    };
    void update();
    const timer = setInterval(() => void update(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
    else dialog.current?.close();
  }, [preview]);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (action === "connect") {
        setConnection(data.connect_url);
        window.open(data.connect_url, "_blank", "noopener,noreferrer");
      } else await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const clinician = staff.role === "admin" || staff.role === "professor";
  const canConnect =
    isAdmin(staff) &&
    appointment.intake_mode === "clinic" &&
    appointment.documents.length === 0;
  const processing = Boolean(
    configured &&
    record?.ai_consent &&
    !needsRecollection &&
    ["received", "generating"].includes(record.status),
  );
  function Fact({ fact }: { fact: MedicalFact }) {
    return (
      <div className="medical-fact">
        <p dir="auto">{fact.text[language]}</p>
        {fact.date && <small>{fact.date}</small>}
        <details>
          <summary>
            {w("מקורות", "Sources")} · {fact.refs.length}
          </summary>
          {fact.refs.map((ref, i) => {
            const source = record?.bundle.records.find(
              (source) => source.id === ref.record_id,
            );
            return (
              <div key={i} className="medical-citation">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => source && setPreview(source)}
                >
                  {source?.title} ·{" "}
                  {source?.record_date ||
                    w("תאריך לא זמין", "Date unavailable")}
                </button>
                <blockquote dir="auto">{ref.quote}</blockquote>
              </div>
            );
          })}
        </details>
      </div>
    );
  }
  return (
    <section className="medical-records-workspace">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <div className="medical-loading" role="status" aria-live="polite">
          <HeartLoader />
          <p>{w("טוענים את המקורות והסיכום", "Loading sources and summary")}</p>
        </div>
      )}
      {canConnect &&
        (mode === "sources" ||
          needsRecollection ||
          record?.status === "failed") && (
          <div className="medical-connection-panel">
            <div>
              <Link2 size={23} />
              <h3>
                {w(
                  "חיבור לתיק כללית — בדיקה אישית",
                  "Connect Clalit — personal test",
                )}
              </h3>
            </div>
            <p>
              {w(
                "הסוכן אוסף מידע מהחשבון האישי לאחר כניסה שלכם. המקורות המקוריים נשארים בכללית; בתיק נשמרים סיכום, הפניות ויומן השמטות.",
                "After you sign in, the collector reads your own account. Original documents stay in Clalit; the card keeps the summary, source references and exclusion audit.",
              )}
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => setSetup(!setup)}
            >
              <Link2 size={18} />
              {w("חיבור הסוכן המקומי", "Connect local collector")}
            </button>
            {setup && (
              <div className="medical-consent-fields">
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={own}
                    onChange={(event) => setOwn(event.target.checked)}
                  />
                  {w(
                    "אני מחבר את התיק הרפואי שלי בלבד לצורך בדיקה אישית.",
                    "I am connecting only my own medical record for this personal test.",
                  )}
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={claude}
                    onChange={(event) => setClaude(event.target.checked)}
                  />
                  {w(
                    "אני מאשר עיבוד המידע הרפואי שנאסף באמצעות Claude לצורך סיכום וסקירת רלוונטיות.",
                    "I approve sending the collected medical information to Claude to prepare the summary and relevance review.",
                  )}
                </label>
                <p className="small-text">
                  {w(
                    "הסוכן צריך לפעול במחשב זה. התחברו לכללית בעצמכם ובחרו את הפרופיל האישי. אין להעביר סיסמה או קוד כניסה.",
                    "The local collector must be running on this computer. Sign into Clalit yourself and select your own profile. Do not share passwords or login codes.",
                  )}
                </p>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!own || busy}
                  onClick={() =>
                    void action("connect", {
                      subject_scope: "self",
                      claude_consent: claude,
                    })
                  }
                >
                  {busy
                    ? w("מחברים…", "Connecting…")
                    : w("פתיחת החיבור המאובטח", "Open secure connection")}
                </button>
                {connection && (
                  <a
                    className="secondary-button"
                    href={connection}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {w("פתיחת חלון הסוכן", "Open collector window")}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      {record && (
        <>
          <div className="medical-import-meta">
            <span className="status-pill">
              {w("ייבוא אישי מכללית", "Personal Clalit import")}
            </span>
            <span>
              {record.bundle.records.length} {w("מקורות", "sources")} ·{" "}
              {new Date(record.created_at).toLocaleString(locale)}
            </span>
            <span>
              {record.reviewed_at
                ? w("סומן כנסקר", "Marked reviewed")
                : w("ממתין לעיון הרופא", "Awaiting clinician review")}
            </span>
          </div>
          {record.bundle.coverage.some(
            (item) => item.status !== "captured",
          ) && (
            <details className="medical-coverage">
              <summary>
                {w("היקף האיסוף ופערים", "Collection coverage and gaps")}
              </summary>
              <p>
                {w(
                  "מקור שלא נאסף אינו מעיד שאין בעיה רפואית.",
                  "An uncollected source does not establish the absence of a medical condition.",
                )}
              </p>
              <ul>
                {record.bundle.coverage.map((item) => (
                  <li key={item.category}>
                    {categoryNames[item.category]?.[language]}:{" "}
                    {{
                      captured: w("נאסף", "Collected"),
                      partial: w("נאסף חלקית", "Partially collected"),
                      no_records_displayed: w(
                        "לא הוצגו רשומות",
                        "No records displayed",
                      ),
                      menu_not_recognized: w(
                        "התפריט לא זוהה",
                        "Menu not recognized",
                      ),
                      adapter_required: w(
                        "טרם ניתן לקרוא את המבנה",
                        "Reader adaptation needed",
                      ),
                      not_accessible: w("לא ניתן לגשת", "Not accessible"),
                      not_collected: w("לא נאסף", "Not collected"),
                    }[item.status] || item.status}{" "}
                    · {item.record_count}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {processing && (
            <div className="medical-loading" role="status" aria-live="polite">
              <HeartLoader />
              <h3>
                {record.status === "generating"
                  ? w(
                      "Claude מעבד את המידע הרפואי",
                      "Claude is processing the medical information",
                    )
                  : w(
                      "הסיכום ממתין לעיבוד",
                      "The summary is queued for processing",
                    )}
              </h3>
              <p>
                {w(
                  "מכינים טיוטה עם מקורות וסקירת רלוונטיות. אין יצירה אוטומטית של הסבר חזותי.",
                  "Preparing a source-cited draft and relevance review. A Visual Explanation is created only when requested.",
                )}
              </p>
            </div>
          )}
          {(needsRecollection || record.status === "failed") && (
            <p className="form-error">
              {w(
                "העיבוד לא הושלם. הטקסט המלא אינו נשמר; חברו את הסוכן מחדש כדי לאסוף ולנסות שוב.",
                "Processing did not complete. Full source text is not retained; reconnect the collector to collect and retry.",
              )}{" "}
              {record.error_code}
            </p>
          )}
          {record.ai_consent && !configured && (
            <p className="setup-note">
              {w(
                "חיבור Claude ממתין להגדרה. השלימו את החיבור בעמוד מפתחות API ואז חברו את הסוכן מחדש.",
                "Claude configuration is required. Complete the connection in API Keys, then reconnect the collector.",
              )}
            </p>
          )}
          {!record.ai_consent && (
            <p className="setup-note">
              {w(
                "הפניות המקור נשמרו. הכנת סיכום דורשת אישור Claude ואיסוף חוזר.",
                "Source references were saved. Preparing a summary requires Claude approval and another collection.",
              )}
            </p>
          )}
          {mode === "sources" && (
            <div className="medical-source-grid">
              {record.bundle.records.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="medical-source-card"
                  onClick={() => setPreview(source)}
                >
                  <BookOpen size={21} />
                  <strong dir="auto">{source.title}</strong>
                  <span>{categoryNames[source.category]?.[language]}</span>
                  <small>
                    {source.record_date ||
                      w("תאריך המקור אינו זמין", "Source date unavailable")}
                  </small>
                  <span className="small-text">
                    {w(
                      "הפניה וקטעי ראיה בלבד",
                      "Reference and evidence excerpts only",
                    )}
                  </span>
                  <Eye size={18} />
                </button>
              ))}
            </div>
          )}
          {mode === "report" && record.summary && (
            <>
              <div className="clinical-report-header">
                <h3>
                  {w("טיוטת סיכום לקראת הביקור", "Pre-visit summary draft")}
                </h3>
                {clinician && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || Boolean(record.reviewed_at)}
                    onClick={() => void action("review")}
                  >
                    <CheckCircle2 size={17} />
                    {w("סימון כנסקר", "Mark reviewed")}
                  </button>
                )}
              </div>
              <Fact fact={record.summary.overview} />
              {record.summary.sections.map((section) => (
                <section className="medical-report-section" key={section.kind}>
                  <h4>{section.title[language]}</h4>
                  {section.items.map((fact, index) => (
                    <Fact key={index} fact={fact} />
                  ))}
                  {section.missing.map((missing, index) => (
                    <p className="small-text" key={index}>
                      {missing[language]}
                    </p>
                  ))}
                </section>
              ))}
              <h4>
                {w("שאלות לעיון הרופא", "Questions for clinician review")}
              </h4>
              <ul>
                {record.summary.questions.map((question, index) => (
                  <li key={index}>{question[language]}</li>
                ))}
              </ul>
              <h4>{w("מגבלות", "Limitations")}</h4>
              <ul>
                {record.summary.limitations.map((item, index) => (
                  <li key={index}>{item[language]}</li>
                ))}
              </ul>
            </>
          )}
          {record.summary && mode !== "presentation" && (
            <details className="medical-relevance">
              <summary>
                {w(
                  "רלוונטיות לקרדיולוגיה ויומן השמטות",
                  "Cardiology relevance and exclusion audit",
                )}
              </summary>
              <p>
                {w(
                  "פריט שנדחה מהסיכום הראשי נשאר ברשימת המקורות. הרופא יכול לסמן אותו כרלוונטי ולעיין במקור לפי ההפניה.",
                  "A source deferred from the main narrative remains in this reference list. The doctor can mark it relevant and review its provider reference.",
                )}
              </p>
              {record.summary.relevance.map((item) => {
                const source = record.bundle.records.find(
                  (source) => source.id === item.record_id,
                );
                return (
                  <div key={item.record_id} className="medical-relevance-item">
                    <strong dir="auto">{source?.title}</strong>
                    <span className="status-pill">
                      {record.review_overrides[item.record_id] === true
                        ? w("רלוונטי לפי הרופא", "Relevant per clinician")
                        : item.priority}
                    </span>
                    <p>{item.reason[language]}</p>
                    <small>
                      {categoryNames[source?.category || "other"]?.[language]} ·{" "}
                      {source?.record_date ||
                        w("תאריך לא זמין", "Date unavailable")}
                    </small>
                    <div className="medical-source-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => source && setPreview(source)}
                      >
                        {w("הפניה למקור", "Source reference")}
                      </button>
                      {clinician &&
                        item.priority === "deferred" &&
                        !record.review_overrides[item.record_id] && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            onClick={() =>
                              void action("include_source", {
                                record_id: item.record_id,
                              })
                            }
                          >
                            {w(
                              "סימון כרלוונטי לעיון",
                              "Mark relevant for review",
                            )}
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </details>
          )}
          {mode === "presentation" &&
            record.summary &&
            (record.visual ? (
              <MedicalVisual
                slides={record.visual.slides}
                bundle={record.bundle}
              />
            ) : (
              <div className="medical-visual-proposal">
                <Heart size={30} />
                <h3>
                  {w(
                    "הצעה להסבר חזותי בזמן הייעוץ",
                    "Visual Explanation proposal for the consultation",
                  )}
                </h3>
                <p>{record.summary.visual_proposal.reason[language]}</p>
                {record.summary.visual_proposal.slides.map((slide, index) => (
                  <div key={index}>
                    <h4>{slide.title[language]}</h4>
                    <p>{slide.explanation[language]}</p>
                  </div>
                ))}
                {clinician && record.summary.visual_proposal.eligible && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void action("create_visual")}
                  >
                    {busy ? <RefreshCw size={18} /> : <Heart size={18} />}{" "}
                    {w(
                      "יצירת הסבר חזותי ושמירה בתיק",
                      "Create Visual Explanation and save to record",
                    )}
                  </button>
                )}
              </div>
            ))}
        </>
      )}
      <dialog
        ref={dialog}
        className="medical-source-dialog"
        onCancel={() => setPreview(null)}
        onClose={() => setPreview(null)}
      >
        <div className="medical-source-dialog-header">
          <h3>{w("הפניה למקור", "Source reference")}</h3>
          <button
            type="button"
            className="icon-button"
            aria-label={w("סגירה", "Close")}
            onClick={() => setPreview(null)}
          >
            <X size={22} />
          </button>
        </div>
        {preview && (
          <>
            <h4 dir="auto">{preview.title}</h4>
            <dl className="medical-provenance">
              <dt>{w("ספק", "Provider")}</dt>
              <dd>Clalit</dd>
              <dt>{w("סוג", "Type")}</dt>
              <dd>{categoryNames[preview.category]?.[language]}</dd>
              <dt>{w("תאריך המקור", "Source date")}</dt>
              <dd>{preview.record_date || w("לא זמין", "Unavailable")}</dd>
              <dt>{w("מספר הפניה במקור", "Provider reference")}</dt>
              <dd dir="auto">
                {preview.provider_reference || w("לא זמין", "Unavailable")}
              </dd>
            </dl>
            <p>
              {w(
                "המסמך המקורי נשאר בכללית. קטעים קצרים נשמרים לתמיכה בסיכום וביומן ההשמטות.",
                "The original record remains in Clalit. Short excerpts support the summary and exclusion audit.",
              )}
            </p>
            {preview.entries.map((entry) => (
              <blockquote dir="auto" key={entry.id}>
                {entry.text}
              </blockquote>
            ))}
          </>
        )}
      </dialog>
    </section>
  );
}
