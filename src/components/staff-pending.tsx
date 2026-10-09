"use client";
import { useLanguage } from "@/components/language-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Clock3 } from "lucide-react";
export function StaffPending({ email }: { email: string }) {
  const { t } = useLanguage();

  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/clinic/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw new Error(t("לא הצלחנו להתנתק. נסו שוב."));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login-card patient-panel">
      <span className="completion-icon">
        <Clock3 size={28} />
      </span>
      <span className="eyebrow">{t("בקשת גישה לצוות")}</span>
      <h1>{t("הכתובת אומתה.")}</h1>
      <p className="panel-description">
        {t(
          "בקשת הגישה שלכם ממתינה לאישור מנהל המערכת. לאחר האישור תוכלו להיכנס לסביבת המרפאה.",
        )}
      </p>
      <p className="verified-email" dir="ltr">
        {email}
      </p>
      <div className="portal-form">
        <button className="button button-dark" onClick={() => router.refresh()}>
          {t("בדיקת מצב האישור")}
        </button>
        <button
          className="text-button"
          onClick={() => void logout()}
          disabled={busy}
        >
          {t("התנתקות")}
        </button>
        {error && (
          <p role="alert" className="form-error">
            {t(error)}
          </p>
        )}
      </div>
    </section>
  );
}
