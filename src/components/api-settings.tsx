"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck, Save, RefreshCw } from "lucide-react";
import { useLanguage } from "./language-provider";
import { HeartLoader } from "./heart-loader";
type Config = {
  provider: string;
  key_configured: boolean;
  masked_key: string;
  processing_enabled: boolean;
  model: string;
  storage_ready: boolean;
  updated_at: string | null;
};
export function ApiSettings() {
  const { t, locale } = useLanguage(),
    [config, setConfig] = useState<Config | null>(null),
    [models, setModels] = useState<{ id: string; name: string }[]>([]),
    [model, setModel] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [checked, setChecked] = useState<string | null>(null),
    [connection, setConnection] = useState<
      "unchecked" | "checking" | "connected" | "failed"
    >("unchecked"),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch("/api/clinic/ai-settings", { cache: "no-store" }),
      v = await r.json();
    if (!r.ok) throw new Error(v.message);
    setConfig(v);
    setModel(v.model);
  }
  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((e) => setError(e.message));
  }, []);
  async function act(action: "check" | "save") {
    setBusy(true);
    setError("");
    setMessage("");
    setChecked(null);
    setConnection("checking");
    try {
      const r = await fetch("/api/clinic/ai-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, model }),
        }),
        v = await r.json();
      if (Array.isArray(v.models)) setModels(v.models);
      if (!r.ok) throw new Error(v.message);
      setConnection("connected");
      setModels(v.models);
      setChecked(v.checked_at);
      if (action === "save") {
        await load();
        setMessage(t("המודל נשמר. בקשות AI חדשות ישתמשו בו."));
      }
    } catch (e) {
      setConnection("failed");
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="api-settings">
      <div className="management-heading">
        <div>
          <span className="eyebrow">{t("ניהול המערכת")}</span>
          <h1>{t("מפתחות API")}</h1>
          <p>{t("חיבור Anthropic ובחירת המודל לבקשות AI חדשות.")}</p>
        </div>
        <div className="settings-actions">
          <Link className="button button-outline" href="/admin">
            {t("חזרה לסביבת המרפאה")}
          </Link>
          <Link className="button button-outline" href="/admin/users">
            {t("ניהול משתמשים")}
          </Link>
        </div>
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
      {!config && !error && (
        <div role="status" className="clinical-loading">
          <HeartLoader />
          {t("טוענים הגדרות…")}
        </div>
      )}
      {config && (
        <div className="api-settings-grid">
          <div className="patient-panel">
            <h2>
              <KeyRound size={23} /> Anthropic
            </h2>
            <label>
              {t("מפתח API")}
              <input
                readOnly
                value={config.masked_key || t("לא הוגדר")}
                type="text"
                aria-label={t("מפתח API ממוסך")}
              />
            </label>
            <p className="form-note">
              {t(
                "המפתח נשמר ב-Vercel כמשתנה סודי ANTHROPIC_API_KEY. המערכת מציגה רק מסכה ואינה שולחת את המפתח לדפדפן.",
              )}
            </p>
            <a
              href="https://vercel.com/galadv73s-projects/cardioahead/settings/environment-variables"
              target="_blank"
              rel="noreferrer"
            >
              {t("ניהול המפתח ב-Vercel")}
            </a>
            <dl>
              <dt>{t("הגדרת מפתח")}</dt>
              <dd>{t(config.key_configured ? "מוגדר" : "לא הוגדר")}</dd>
              <dt>{t("ספק פעיל")}</dt>
              <dd>{config.provider === "claude" ? "Anthropic" : "OpenAI"}</dd>
              <dt>{t("עיבוד מסמכי בדיקה")}</dt>
              <dd>{t(config.processing_enabled ? "מופעל" : "לא מופעל")}</dd>
              <dt>{t("מצב החיבור")}</dt>
              <dd>
                {t(
                  connection === "connected"
                    ? "החיבור והמודל נבדקו בהצלחה"
                    : connection === "checking"
                      ? "בודקים את החיבור…"
                      : connection === "failed"
                        ? "החיבור לא אומת"
                        : "טרם נבדק בחלון זה",
                )}
              </dd>
            </dl>
            {checked && (
              <p className="form-note">
                {t("נבדק")}: {new Date(checked).toLocaleString(locale)}
              </p>
            )}
            <button
              className="button button-dark"
              disabled={busy || !config.key_configured}
              onClick={() => void act("check")}
            >
              {busy ? <HeartLoader size={20} /> : <RefreshCw size={18} />}{" "}
              {t("בדיקת חיבור וטעינת מודלים")}
            </button>
          </div>
          <div className="patient-panel">
            <h2>
              <ShieldCheck size={23} />
              {t("בחירת מודל")}
            </h2>
            <p>
              {t(
                "בדיקת החיבור טוענת מודלים זמינים מחשבון Anthropic. השמירה בודקת את המודל לפני הפעלתו; דוחות קיימים נשמרים כפי שהם.",
              )}
            </p>
            <label>
              {t("מודל Anthropic")}
              <select
                value={model}
                disabled={busy || !models.length}
                onChange={(e) => {
                  setModel(e.target.value);
                  setChecked(null);
                  setConnection("unchecked");
                }}
              >
                {!models.some((m) => m.id === model) && (
                  <option value={model}>{model}</option>
                )}
                {models.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name} · {m.id}
                  </option>
                ))}
              </select>
            </label>
            {!config.storage_ready && (
              <p className="form-error">
                {t("יש להחיל את עדכון מסד הנתונים להגדרות AI.")}
              </p>
            )}
            <p className="form-note">
              {t(
                "הבדיקה שולחת בקשת חיבור קצרה ללא מידע רפואי ועשויה לצרוך מספר קטן של טוקנים.",
              )}
            </p>
            <div className="settings-actions">
              <button
                className="button button-dark"
                disabled={
                  busy ||
                  !models.length ||
                  !config.storage_ready ||
                  model === config.model
                }
                onClick={() => void act("save")}
              >
                {busy ? <HeartLoader size={20} /> : <Save size={18} />}{" "}
                {t("שמירת המודל")}
              </button>
            </div>
            {config.updated_at && (
              <p className="form-note">
                {t("עודכן")}:{" "}
                {new Date(config.updated_at).toLocaleString(locale)}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
