"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ArrowLeft } from "lucide-react";
export function ClinicLogin({
  ready,
  local,
}: {
  ready: boolean;
  local: boolean;
}) {
  const [email, setEmail] = useState(local ? "tester@cardioahead.local" : "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(local);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/clinic/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: sent ? "verify" : "request",
          email,
          code,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (sent) router.refresh();
      else setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא הצלחנו להתחבר. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login-card patient-panel">
      <span className="completion-icon">
        <LockKeyhole size={28} />
      </span>
      <span className="eyebrow">גישה לצוות המרפאה</span>
      <h1>ברוכים הבאים.</h1>
      <p className="panel-description">
        היכנסו עם כתובת הדוא״ל האישית שלכם כדי ליצור הזמנות ולצפות במסמכים
        שהתקבלו.
      </p>
      {!ready ? (
        <div className="info-box">
          <p>
            המסכים מוכנים. הכניסה תיפתח לאחר חיבור האחסון הפרטי וחשבונות צוות
            המרפאה.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="portal-form">
          <label>
            כתובת דוא״ל
            <input
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={sent && !local}
            />
          </label>
          {sent && (
            <>
              <label>
                {local
                  ? "סיסמת סביבת הבדיקה המקומית"
                  : "קוד כניסה שנשלח לדוא״ל"}
                <input
                  type={local ? "password" : "text"}
                  inputMode={local ? undefined : "numeric"}
                  autoComplete={local ? "current-password" : "one-time-code"}
                  dir="ltr"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={local ? 128 : 8}
                />
              </label>
              {!local && (
                <p className="form-note">
                  אם הכתובת רשומה במרפאה, יישלח אליה קוד. הקוד מוגבל בזמן.
                </p>
              )}
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-dark" disabled={busy}>
            {busy
              ? "רגע, מתחברים…"
              : sent
                ? "כניסה למרפאה"
                : "שלחו לי קוד כניסה"}
            <ArrowLeft size={17} />
          </button>
          {sent && !local && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setSent(false);
                setCode("");
                setError("");
              }}
            >
              שינוי כתובת / בקשת קוד חדש
            </button>
          )}
        </form>
      )}
    </section>
  );
}
