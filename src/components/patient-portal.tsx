"use client";
import { useRef, useState } from "react";
import Link from "next/link";
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
      setError(e instanceof Error ? e.message : "לא הצלחנו לאמת את הכניסה.");
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
        const message = e instanceof Error ? e.message : "ההעלאה לא הושלמה.";
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
      setError(e instanceof Error ? e.message : "השליחה לא הושלמה.");
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
      setError(e instanceof Error ? e.message : "לא הצלחנו לצאת.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="patient-layout">
      <aside className="patient-sidebar">
        <span className="eyebrow">מרחב המטופל</span>
        <h1>
          מתכוננים לביקור,
          <br />
          בקצב שלכם.
        </h1>
        <p>
          מרכזים את המסמכים,
          <br />
          כדי להגיע לפגישה
          <br />
          עם תמונה ברורה יותר.
        </p>
        <ol className="wizard-steps">
          {["כניסה אישית", "המסמכים", "סיום ההכנה"].map((label, index) => (
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
          ))}
        </ol>
        <div className="sidebar-note">
          <LockKeyhole size={20} />
          <p>הקישור והקוד שקיבלתם מהמרפאה מיועדים לביקור שלכם בלבד.</p>
        </div>
      </aside>
      <section className="patient-panel">
        {step === 0 && (
          <>
            <span className="eyebrow">צעד 1 מתוך 3</span>
            <h2>נעים להכיר.</h2>
            <p className="panel-description">
              הזינו את קוד הגישה בן שש הספרות שקיבלתם מצוות המרפאה.
            </p>
            {!ready ? (
              <div className="info-box">
                <p>
                  הגישה תיפתח לאחר חיבור האחסון הפרטי. אין אפשרות להעלות מסמכים
                  בשלב זה.
                </p>
              </div>
            ) : (
              <form onSubmit={verify} className="portal-form">
                <label>
                  קוד גישה
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
                  {busy ? "מאמתים את הכניסה…" : "כניסה למרחב האישי"}
                  <ArrowLeft size={17} />
                </button>
              </form>
            )}
          </>
        )}
        {appointment && step === 1 && (
          <>
            <span className="eyebrow">צעד 2 מתוך 3</span>
            <h2>המסמכים לקראת הביקור.</h2>
            <p className="panel-description">
              בחרו את קובצי ה-PDF שתרצו לצרף. כל מסמך יישמר לפני שתמשיכו לשליחה
              למרפאה.
            </p>
            <div className="appointment-card">
              <span className="appointment-icon">
                <CalendarDays size={24} />
              </span>
              <div>
                <span>{appointment.patient_label}</span>
                <h3>פגישה עם פרופ׳ אלעד מאור</h3>
                <p>
                  {appointment.appointment_at
                    ? new Date(appointment.appointment_at).toLocaleString(
                        "he-IL",
                        { dateStyle: "long", timeStyle: "short" },
                      )
                    : "מועד הביקור יימסר על ידי צוות המרפאה"}
                </p>
              </div>
            </div>
            <div className="info-box">
              <p>
                בשלב הבדיקות השתמשו רק במסמכי הבדיקה הפיקטיביים. המסמכים
                האמיתיים ייפתחו בהמשך.
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
              <strong>בחירת מסמכים מהמכשיר</strong>
              <span>PDF בלבד · עד 4 MB לקובץ · עד 10 מסמכים</span>
              <button
                type="button"
                className="button button-dark"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                {busy ? "מעלים מסמכים…" : "בחרו קבצים"}
                <FileText size={17} />
              </button>
              <input
                ref={fileInput}
                className="file-input"
                type="file"
                accept=".pdf,application/pdf"
                multiple
                aria-label="בחירת קובצי PDF"
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
                    <small>{Math.ceil(d.bytes / 1024)} KB · נשמר</small>
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
                        ? "מעלה…"
                        : "ממתין להעלאה"}
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
                      הסרה מהרשימה
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
                בדיקה לפני שליחה
                <ArrowLeft size={17} />
              </button>
              <span>{appointment.documents.length} מסמכים נשמרו</span>
            </div>
          </>
        )}
        {appointment && step === 2 && (
          <>
            <span className="eyebrow">צעד 3 מתוך 3</span>
            <h2>הכול מוכן לשליחה?</h2>
            <p className="panel-description">
              המסמכים הבאים יופיעו בתיק הביקור לצוות המרפאה.
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
                בדקתי שהמסמכים שייכים לתיק הבדיקה, ואני מאשר/ת לצוות המרפאה
                לצפות בהם.{" "}
                <Link href="/privacy" target="_blank">
                  פרטי השימוש במידע
                </Link>
              </span>
            </label>
            <div className="panel-actions">
              <button
                className="button button-dark"
                disabled={busy || !confirmed}
                onClick={finish}
              >
                {busy ? "שולחים למרפאה…" : "שליחה למרפאה"}
                <Check size={17} />
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setStep(1)}
              >
                חזרה למסמכים
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <div className="completion">
            <span className="completion-icon">
              <Check size={32} />
            </span>
            <span className="eyebrow">ההכנה הושלמה</span>
            <h2>המסמכים התקבלו.</h2>
            <p>המסמכים שצירפתם זמינים כעת לצוות המרפאה לקראת הפגישה.</p>
            <div className="info-box">
              <p>
                אין צורך לשלוח שוב. היציאה מהעמוד לא תמחק את המסמכים שנשמרו.
              </p>
            </div>
            <Link href="/" className="button button-dark">
              חזרה לאתר
              <ArrowLeft size={17} />
            </Link>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {appointment && (
          <button
            className="text-button session-exit"
            disabled={busy}
            onClick={logout}
          >
            <LogOut size={16} /> יציאה מהמרחב האישי
          </button>
        )}
      </section>
    </div>
  );
}
