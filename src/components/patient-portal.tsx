"use client";
import { useLanguage } from "@/components/language-provider";
import { useRef, useState } from "react";
import Link from "next/link";
import { HeartIllustration } from "./heart-illustration";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  FolderOpen,
  LockKeyhole,
  CalendarDays,
  LogOut,
} from "lucide-react";
import type { AppointmentView, DocumentView } from "@/lib/portal/types";
type QueueItem = {
  file: File;
  state: "waiting" | "uploading" | "failed";
  error?: string;
};
export function PatientPortal({
  token,
  ready,
}: {
  token: string;
  ready: boolean;
}) {
  const { t, locale } = useLanguage();

  const [code, setCode] = useState("");
  const [appointment, setAppointment] = useState<AppointmentView | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  async function api(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    return data;
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/patient/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code }),
      });
      const data = await api("/api/patient/appointment");
      setAppointment(data.appointment);
      setStep(data.appointment.status === "invited" ? 1 : 3);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("לא הצלחנו לאמת את הכניסה."));
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (busy || !appointment) return;
    setBusy(true);
    setError("");
    const items = files.map((file) => ({ file, state: "waiting" as const }));
    setQueue(items);
    for (let i = 0; i < files.length; i++) {
      setQueue((current) =>
        current.map((q) =>
          q.file === files[i] ? { ...q, state: "uploading" } : q,
        ),
      );
      try {
        const data = new FormData();
        data.append("file", files[i]);
        const result = await api("/api/patient/documents", {
          method: "POST",
          body: data,
        });
        setAppointment((current) =>
          current
            ? {
                ...current,
                documents: [
                  ...current.documents,
                  result.document as DocumentView,
                ],
              }
            : current,
        );
        setQueue((current) => current.filter((q) => q.file !== files[i]));
      } catch (e) {
        const message = e instanceof Error ? e.message : t("ההעלאה לא הושלמה.");
        setQueue((current) =>
          current.map((q) =>
            q.file === files[i] ? { ...q, state: "failed", error: message } : q,
          ),
        );
      }
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await api("/api/patient/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("השליחה לא הושלמה."));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/api/patient/appointment", { method: "DELETE" });
      setAppointment(null);
      setQueue([]);
      setConfirmed(false);
      setStep(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("לא הצלחנו לצאת."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="patient-layout">
      <aside
        className={
          "patient-sidebar " + (step === 0 ? "invitation-sidebar" : "")
        }
      >
        <span className="eyebrow">{t("מרחב המטופל")}</span>
        <h1>
          {t("מתכוננים לביקור,")}
          <br />
          {t("בקצב שלכם.")}
        </h1>
        <p>
          {t("מרכזים את המסמכים,")}
          <br />
          {t("כדי להגיע לפגישה")}
          <br />
          {t("עם תמונה ברורה יותר.")}
        </p>
        {step === 0 && (
          <div className="invitation-heart">
            <HeartIllustration />
            <span className="art-caption">
              {t("איור סכמטי · אינו מייצג מטופל")}
            </span>
          </div>
        )}
        <ol className="wizard-steps">
          {[t("כניסה אישית"), t("המסמכים"), t("סיום ההכנה")].map(
            (label, index) => (
              <li
                key={label}
                className={
                  Math.min(step, 2) === index
                    ? "current"
                    : step > index
                      ? "complete"
                      : ""
                }
              >
                <span>{step > index ? <Check size={15} /> : index + 1}</span>
                <strong>{label}</strong>
              </li>
            ),
          )}
        </ol>
        <div className="sidebar-note">
          <LockKeyhole size={20} />
          <p>{t("הקישור והקוד שקיבלתם מהמרפאה מיועדים לביקור שלכם בלבד.")}</p>
        </div>
      </aside>
      <section className="patient-panel">
        {step === 0 && (
          <>
            <span className="eyebrow">{t("צעד 1 מתוך 3")}</span>
            <h2>{t("ברוכים הבאים למרפאת פרופ׳ אלעד מאור")}</h2>
            <div className="invitation-intro">
              <p>
                {t(
                  "זהו הקישור האישי שקיבלתם מהמרפאה. כאן תוכלו לרכז ולשלוח את המסמכים לקראת הביקור, כדי שלצוות תהיה תמונה מסודרת לפני הפגישה.",
                )}
              </p>
              <div className="invitation-privacy">
                <LockKeyhole size={18} />
                <span>
                  {t("המסמכים נשמרים בגישה פרטית לצוות המרפאה המורשה.")}
                </span>
              </div>
            </div>
            <p className="panel-description">
              {t("הזינו את קוד הגישה בן שש הספרות שקיבלתם מצוות המרפאה.")}
            </p>
            {!ready ? (
              <div className="info-box">
                <p>
                  {t(
                    "הגישה תיפתח לאחר חיבור האחסון הפרטי. אין אפשרות להעלות מסמכים בשלב זה.",
                  )}
                </p>
              </div>
            ) : (
              <form onSubmit={verify} className="portal-form">
                <label>
                  {t("קוד גישה")}
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    dir="ltr"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    required
                    placeholder="000000"
                  />
                </label>
                <button className="button button-dark" disabled={busy}>
                  {busy ? t("מאמתים את הכניסה…") : t("כניסה למרחב האישי")}
                  <ArrowLeft size={17} />
                </button>
              </form>
            )}
          </>
        )}
        {step === 0 && (
          <div className="invitation-guidance">
            <h3>{t("שלושה צעדים פשוטים")}</h3>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>{t("מזינים את הקוד שקיבלתם")}</strong>
                  <p>{t("אין צורך לפתוח חשבון או לבחור סיסמה.")}</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>{t("מצרפים את המסמכים")}</strong>
                  <p>{t("אפשר לבחור כמה קובצי PDF מהמחשב או מהטלפון.")}</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>{t("בודקים ושולחים למרפאה")}</strong>
                  <p>
                    {t("לאחר האישור, המסמכים יהיו זמינים לצוות לקראת הפגישה.")}
                  </p>
                </div>
              </li>
            </ol>
            <details className="invitation-help">
              <summary>{t("מה כדאי להכין?")}</summary>
              <p>
                {t(
                  "סיכומי ביקור או אשפוז, הפניה, תוצאות בדיקות לב ורשימת התרופות שלכם — לפי ההנחיות שקיבלתם מהמרפאה.",
                )}
              </p>
              <p>
                {t(
                  "בשלב הבדיקות מעלים רק את מסמכי הבדיקה הפיקטיביים של CardioAhead.",
                )}
              </p>
              <Link
                href="/test-documents"
                target="_blank"
                className="text-link"
              >
                {t("להורדת מסמכי הבדיקה")}
              </Link>
            </details>
            <details className="invitation-help">
              <summary>{t("צריכים עזרה?")}</summary>
              <p>
                {t(
                  "בן או בת משפחה יכולים לעזור לכם להכין ולהעלות את הקבצים. אם חסר לכם קוד, או שהקישור אינו עובד, פנו לצוות המרפאה.",
                )}
              </p>
              <a
                href="https://eladmaor.co.il/"
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                {t("פרטי הקשר של המרפאה")}
              </a>
            </details>
            <p className="form-note">{t("ההעלאה אינה פנייה רפואית דחופה.")}</p>
          </div>
        )}
        {appointment && step === 1 && (
          <>
            <span className="eyebrow">{t("צעד 2 מתוך 3")}</span>
            <h2>{t("המסמכים לקראת הביקור.")}</h2>
            <p className="panel-description">
              {t(
                "בחרו את קובצי ה-PDF שתרצו לצרף. כל מסמך יישמר לפני שתמשיכו לשליחה למרפאה.",
              )}
            </p>
            <div className="appointment-card">
              <span className="appointment-icon">
                <CalendarDays size={24} />
              </span>
              <div>
                <span>{appointment.patient_label}</span>
                <h3>{t("פגישה עם פרופ׳ אלעד מאור")}</h3>
                <p>
                  {appointment.appointment_at
                    ? new Date(appointment.appointment_at).toLocaleString(
                        locale,
                        { dateStyle: "long", timeStyle: "short" },
                      )
                    : t("מועד הביקור יימסר על ידי צוות המרפאה")}
                </p>
              </div>
            </div>
            <div className="info-box">
              <p>
                {t(
                  "בשלב הבדיקות השתמשו רק במסמכי הבדיקה הפיקטיביים. המסמכים האמיתיים ייפתחו בהמשך.",
                )}
              </p>
            </div>
            <div
              className="demo-upload-area"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) void upload(Array.from(e.dataTransfer.files));
              }}
            >
              <FolderOpen size={30} />
              <strong>{t("בחירת מסמכים מהמכשיר")}</strong>
              <span>{t("PDF בלבד · עד 4 MB לקובץ · עד 10 מסמכים")}</span>
              <button
                type="button"
                className="button button-dark"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                {busy ? t("מעלים מסמכים…") : t("בחרו קבצים")}
                <FileText size={17} />
              </button>
              <input
                ref={fileInput}
                className="file-input"
                type="file"
                accept=".pdf,application/pdf"
                multiple
                aria-label={t("בחירת קובצי PDF")}
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files) void upload(Array.from(e.target.files));
                }}
              />
            </div>
            <div className="document-options" aria-live="polite">
              {appointment.documents.map((d) => (
                <div className="document-option" key={d.id}>
                  <span className="document-icon">
                    <FileText size={21} />
                  </span>
                  <span>
                    <strong dir="auto">{d.filename}</strong>
                    <small>
                      {Math.ceil(d.bytes / 1024)}
                      {t(" KB · נשמר")}
                    </small>
                  </span>
                  <CheckCircle2 size={20} />
                </div>
              ))}
              {queue.map((q, index) => (
                <div className="upload-queue-row" key={index}>
                  <strong dir="auto">{q.file.name}</strong>
                  <span>
                    {q.state === "failed"
                      ? q.error
                      : q.state === "uploading"
                        ? t("מעלה…")
                        : t("ממתין להעלאה")}
                  </span>
                  {q.state === "failed" && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        setQueue((current) =>
                          current.filter((item) => item !== q),
                        )
                      }
                    >
                      {t("הסרה מהרשימה")}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="panel-actions">
              <button
                className="button button-dark"
                disabled={
                  busy || appointment.documents.length === 0 || queue.length > 0
                }
                onClick={() => setStep(2)}
              >
                {t("בדיקה לפני שליחה")}
                <ArrowLeft size={17} />
              </button>
              <span>
                {appointment.documents.length}
                {t(" מסמכים נשמרו")}
              </span>
            </div>
          </>
        )}
        {appointment && step === 2 && (
          <>
            <span className="eyebrow">{t("צעד 3 מתוך 3")}</span>
            <h2>{t("הכול מוכן לשליחה?")}</h2>
            <p className="panel-description">
              {t("המסמכים הבאים יופיעו בתיק הביקור לצוות המרפאה.")}
            </p>
            <div className="review-list">
              {appointment.documents.map((d) => (
                <div key={d.id}>
                  <FileText size={18} />
                  <strong dir="auto">{d.filename}</strong>
                  <CheckCircle2 size={17} />
                </div>
              ))}
            </div>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                {t(
                  "בדקתי שהמסמכים שייכים לתיק הבדיקה, ואני מאשר/ת לצוות המרפאה לצפות בהם ולעבד את מסמכי הבדיקה באמצעות שירות AI מאושר.",
                )}{" "}
                <Link href="/privacy" target="_blank">
                  {t("פרטי השימוש במידע")}
                </Link>
              </span>
            </label>
            <div className="panel-actions">
              <button
                className="button button-dark"
                disabled={busy || !confirmed}
                onClick={finish}
              >
                {busy ? t("שולחים למרפאה…") : t("שליחה למרפאה")}
                <Check size={17} />
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setStep(1)}
              >
                {t("חזרה למסמכים")}
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <div className="completion">
            <span className="completion-icon">
              <Check size={32} />
            </span>
            <span className="eyebrow">{t("ההכנה הושלמה")}</span>
            <h2>{t("המסמכים התקבלו.")}</h2>
            <p>{t("המסמכים שצירפתם זמינים כעת לצוות המרפאה לקראת הפגישה.")}</p>
            <div className="info-box">
              <p>
                {t(
                  "אין צורך לשלוח שוב. היציאה מהעמוד לא תמחק את המסמכים שנשמרו.",
                )}
              </p>
            </div>
            <Link href="/" className="button button-dark">
              {t("חזרה לאתר")}
              <ArrowLeft size={17} />
            </Link>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {appointment && (
          <button
            className="text-button session-exit"
            disabled={busy}
            onClick={logout}
          >
            <LogOut size={16} />
            {t("יציאה מהמרחב האישי")}
          </button>
        )}
      </section>
    </div>
  );
}
