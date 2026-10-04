"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ArrowLeft } from "lucide-react";
export function ClinicLogin({ ready }: { ready: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (!countdown) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);
  async function authenticate(action: "request" | "verify") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/clinic/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (action === "verify") router.refresh();
      else {
        setSent(true);
        setCode("");
        setCountdown(data.retryAfter || 60);
      }
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
      <h1>{sent ? "בדקו את הדוא״ל שלכם." : "ברוכים הבאים."}</h1>
      <p className="panel-description">
        {sent
          ? "שלחנו קוד אישי בן 6 ספרות לכתובת שהזנתם. הקוד תקף ל־10 דקות."
          : "היכנסו עם כתובת הדוא״ל האישית שלכם. גישה חדשה לצוות המרפאה דורשת אישור מנהל המערכת."}
      </p>
      {!ready && (
        <div className="info-box">
          <p>שירות הכניסה ייפתח לאחר השלמת חיבור הדוא״ל והאחסון הפרטי.</p>
        </div>
      )}
      <form
        className="portal-form"
        onSubmit={(e) => {
          e.preventDefault();
          void authenticate(sent ? "verify" : "request");
        }}
      >
        <label>
          כתובת דוא״ל
          <input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={sent || busy || !ready}
          />
        </label>
        {sent && (
          <label>
            קוד כניסה בן 6 ספרות
            <input
              className="otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
              }
              required
              autoFocus
              disabled={busy}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-dark"
          disabled={busy || !ready || (sent && code.length !== 6)}
        >
          {busy ? "רגע, מתחברים…" : sent ? "אימות וכניסה" : "שלחו לי קוד כניסה"}
          <ArrowLeft size={17} />
        </button>
        {sent && (
          <div className="login-secondary">
            <button
              className="text-button"
              type="button"
              disabled={busy || countdown > 0}
              onClick={() => void authenticate("request")}
            >
              {countdown > 0
                ? "אפשר לשלוח שוב בעוד " + countdown + " שניות"
                : "שליחת קוד חדש"}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode("");
                setError("");
              }}
            >
              שינוי כתובת דוא״ל
            </button>
          </div>
        )}
        <p className="form-note">
          אין צורך בסיסמה. אל תשתפו את קוד הכניסה עם אחרים.
        </p>
      </form>
    </section>
  );
}
