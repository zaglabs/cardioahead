"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Monitor,
  Download,
  ExternalLink,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { HeartLoader } from "./heart-loader";
import { useLanguage } from "./language-provider";
import type { AppointmentView } from "@/lib/portal/types";
type State = {
  enabled: boolean;
  appointment_id: string;
  status: string;
  record_count: number;
  completed_at: string | null;
  needs_reconnect: boolean;
  download_url: string;
};
export function PatientClalitImport({
  appointment,
  onReceived,
  onBack,
}: {
  appointment: AppointmentView;
  onReceived: () => void;
  onBack: () => void;
}) {
  const { language, t } = useLanguage(),
    w = (he: string, en: string) => (language === "he" ? he : en);
  const [state, setState] = useState<State | null>(null),
    [own, setOwn] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connection, setConnection] = useState("");
  const received = state?.status === "ready",
    processing =
      (state?.status === "received" || state?.status === "generating") &&
      !state?.needs_reconnect;
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(
          "/api/patient/clalit?appointment=" + appointment.id,
          { cache: "no-store" },
        ),
        data = await r.json();
      if (!r.ok) throw Error(data.message);
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : "");
    }
  }, [appointment.id, t]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/patient/clalit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "connect",
            appointment_id: appointment.id,
            own_account: own,
            claude_consent: consent,
            language,
          }),
        }),
        data = await r.json();
      if (!r.ok) throw Error(data.message);
      setConnection(data.connect_url);
      window.open(data.connect_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : "");
    } finally {
      setBusy(false);
    }
  }
  async function back() {
    if (connection) {
      try {
        await fetch("/api/patient/clalit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            appointment_id: appointment.id,
          }),
        });
      } catch {
        setError(
          w(
            "לא ניתן לבטל כרגע. נסו שוב.",
            "Could not cancel yet. Please retry.",
          ),
        );
        return;
      }
    }
    onBack();
  }
  return (
    <section
      className="patient-clalit-import"
      aria-labelledby="patient-clalit-title"
    >
      <div className="patient-method-heading">
        <ShieldCheck size={30} />
        <div>
          <span className="eyebrow">
            {w("באישור שלכם", "With your permission")}
          </span>
          <h2 id="patient-clalit-title">
            {w("ייבוא מכללית", "Import from Clalit")}
          </h2>
        </div>
      </div>
      <p className="patient-method-lead">
        {w(
          "אפשר לאסוף מידע מהתיק שלכם בכללית ולהעביר סיכום למרפאה. המסמכים המקוריים נשארים בכללית.",
          "Collect information from your Clalit record and send a summary to the clinic. Original documents stay in Clalit.",
        )}
      </p>
      {!state && (
        <div className="patient-flow-loading" role="status">
          <HeartLoader />
          <p>{w("בודקים את אפשרות החיבור", "Checking the connection")}</p>
        </div>
      )}
      {state && !state.enabled && !received && (
        <div className="info-box">
          <p>
            {w(
              "הייבוא מכללית אינו זמין כרגע. אפשר לבחור בהעלאת מסמכים או לפנות לצוות המרפאה.",
              "Clalit import is temporarily unavailable. Choose Upload Documents or contact the clinic.",
            )}
          </p>
        </div>
      )}
      {state?.enabled && !received && !processing && (
        <>
          <div className="patient-desktop-note">
            <Monitor size={28} />
            <div>
              <strong>
                {w(
                  "בשלב ההרצה משתמשים במחשב Windows עם Chrome",
                  "This pilot needs a Windows computer with Chrome",
                )}
              </strong>
              <p>
                {w(
                  "אין אפשרות לייבא ישירות מהטלפון בשלב זה. אפשר להיעזר בבן משפחה או בצוות המרפאה.",
                  "Direct phone import is not available yet. A family member or the clinic can help you.",
                )}
              </p>
            </div>
          </div>
          <ol className="patient-clalit-steps">
            <li>
              <strong>
                {w(
                  "פותחים את האספן במחשב",
                  "Open the collector on your computer",
                )}
              </strong>
              <p>
                {w(
                  "בהפעלה הראשונה הורידו את התיקייה, חלצו אותה ופתחו את ״Start CardioAhead״. אין צורך להתקין תוכנת פיתוח.",
                  "The first time, download and extract the folder, then open “Start CardioAhead”. No development tools are needed.",
                )}
              </p>
              <a
                className="secondary-button patient-large-button"
                href={state.download_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={21} />
                {w("הורדת האספן למחשב", "Download the desktop collector")}
              </a>
            </li>
            <li>
              <strong>
                {w(
                  "מתחברים לכללית ובוחרים את הרשומות",
                  "Sign into Clalit and select your records",
                )}
              </strong>
              <p>
                {w(
                  "לאחר האישור כאן, האספן יפתח את כללית. התחברו בעצמכם ובחרו את הפרופיל שלכם. הסיסמה וקוד ההתחברות אינם נשלחים ל־CardioAhead.",
                  "After you approve below, the collector opens Clalit. Sign in yourself and select your own profile. Your password and login code are not sent to CardioAhead.",
                )}
              </p>
            </li>
            <li>
              <strong>{w("בודקים ומייבאים", "Review and import")}</strong>
              <p>
                {w(
                  "האספן יציג את שמות המקורות והתאריכים. בחרו מה להעביר ולחצו על ייבוא. חלק מהדוחות עדיין אינם נתמכים.",
                  "The collector shows source names and dates. Choose what to send and click Import. Some reports are not yet supported.",
                )}
              </p>
            </li>
          </ol>
          <div className="patient-clalit-consent">
            <label>
              <input
                type="checkbox"
                checked={own}
                onChange={(e) => setOwn(e.target.checked)}
              />
              <span>
                {w(
                  "זהו חשבון כללית שלי, ואני מאשר/ת לאסוף ממנו מידע עבור הביקור שלי.",
                  "This is my own Clalit account. I approve collecting information for my clinic visit.",
                )}
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                {w(
                  "אני מאשר/ת להעביר את המידע שנאסף ל־Claude של Anthropic להכנת סיכום לצוות המרפאה. במרפאה נשמרים הסיכום, ההפניות למקור וקטעי ראיה קצרים.",
                  "I approve sending the collected information to Anthropic’s Claude to prepare a summary for clinic staff. The clinic keeps the summary, source references and short supporting excerpts.",
                )}
              </span>
            </label>
          </div>
          <button
            className="primary-button patient-large-button patient-connect-button"
            disabled={
              !own || !consent || busy || appointment.documents.length > 0
            }
            onClick={() => void connect()}
          >
            <ExternalLink size={23} />
            {busy
              ? w("פותחים את החיבור…", "Opening the connection…")
              : w("פתיחת החיבור לכללית", "Open Clalit connection")}
          </button>
          {appointment.documents.length > 0 && (
            <p>
              {w(
                "כבר צורפו קבצים להזמנה זו. בשלב ההרצה, לייבוא מכללית יש לבקש הזמנה נפרדת מהמרפאה.",
                "Files are already attached to this invitation. During the pilot, ask the clinic for a separate invitation for Clalit import.",
              )}
            </p>
          )}
          {connection && (
            <div className="patient-collector-help">
              <p>
                {w(
                  "האספן צריך להיות פתוח במחשב. אם חלון החיבור לא נפתח, לחצו על הכפתור הבא.",
                  "The collector must be running on this computer. If the connection window did not open, use this button.",
                )}
              </p>
              <a
                className="secondary-button patient-large-button"
                href={connection}
                target="_blank"
                rel="noopener noreferrer"
              >
                {w(
                  "פתיחה חוזרת של חלון החיבור",
                  "Open the connection window again",
                )}
                <ExternalLink size={20} />
              </a>
            </div>
          )}
        </>
      )}
      {processing && !state?.needs_reconnect && (
        <div className="patient-flow-loading" role="status" aria-live="polite">
          <HeartLoader />
          <h3>
            {w(
              "המידע התקבל. מכינים את הסיכום למרפאה.",
              "Information received. Preparing the clinic summary.",
            )}
          </h3>
          <p>
            {w(
              "אפשר לסגור את הדף. צוות המרפאה יוכל לצפות במידע לאחר סיום העיבוד.",
              "You may close this page. Clinic staff can review the information when processing finishes.",
            )}
          </p>
        </div>
      )}
      {state?.needs_reconnect && (
        <p className="form-error" role="alert">
          {w(
            "הייבוא לא הושלם. חזרו לאספן, אספו שוב ונסו לייבא. אם החיבור פג, פתחו חיבור חדש או פנו למרפאה.",
            "Import did not finish. Return to the collector, collect again and retry. If the connection expired, open a new connection or ask the clinic for help.",
          )}
        </p>
      )}
      {received && (
        <div className="patient-import-received">
          <ShieldCheck size={32} />
          <h3>
            {w(
              "המידע מכללית התקבל במרפאה",
              "Your Clalit information reached the clinic",
            )}
          </h3>
          <p>
            {state.record_count}{" "}
            {w(
              "רשומות מקור נשמרו כסיכום והפניות.",
              "source records were saved as a summary and references.",
            )}
          </p>
          <button
            className="primary-button patient-large-button"
            onClick={onReceived}
          >
            {w("סיום ההכנה", "Finish preparation")}
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!received && !processing && (
        <button
          className="text-button patient-back-button"
          onClick={() => void back()}
          disabled={busy}
        >
          <ArrowLeft size={19} />
          {w("חזרה לבחירת האפשרות", "Back to your options")}
        </button>
      )}
      {processing && (
        <button className="text-button" onClick={() => void refresh()}>
          <RefreshCw size={17} />
          {w("בדיקת מצב", "Check progress")}
        </button>
      )}
    </section>
  );
}
