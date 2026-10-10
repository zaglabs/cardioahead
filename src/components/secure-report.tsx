"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, LockKeyhole, LogOut } from "lucide-react";
import { useLanguage } from "./language-provider";
import { VisitReportView } from "./visit-report-view";
import type { LocalizedReport } from "@/lib/visit/types";
export function SecureReport({ token }: { token: string }) {
  const { t } = useLanguage(),
    [data, setData] = useState<{
      verified: boolean;
      report?: LocalizedReport;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [code, setCode] = useState("");
  const endpoint = "/api/reports/" + token;
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" }),
      value = await response.json();
    if (!response.ok) {
      setData(null);
      throw new Error(value.message);
    }
    setData(value);
  }, [endpoint]);
  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!data?.verified) return;
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      15000,
    );
    return () => clearInterval(timer);
  }, [data?.verified, load]);
  async function action(action: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint + "/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, code }),
        }),
        value = await response.json();
      if (!response.ok) throw new Error(value.message);
      if (action === "request") setSent(true);
      else if (action === "logout") {
        setSent(false);
        setCode("");
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="secure-report">
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {data?.verified && data.report ? (
        <>
          <div className="secure-report-actions">
            <a className="button button-dark" href={endpoint + "/pdf"}>
              <Download size={18} />
              {t("הורדת הדוח המאושר כ־PDF")}
            </a>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void action("logout")}
            >
              <LogOut size={17} />
              {t("סיום הצפייה")}
            </button>
          </div>
          <VisitReportView report={data.report} />
        </>
      ) : data ? (
        <section className="patient-panel report-access-panel">
          <LockKeyhole size={30} />
          <h1>{t("הדוח המאובטח שלך")}</h1>
          <p>
            {t(
              "כדי לצפות בדוח שאושר במרפאה, יש לאמת גישה עם קוד שנשלח לכתובת הדוא״ל שאושרה עבורכם.",
            )}
          </p>
          {!sent ? (
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void action("request")}
            >
              {t(busy ? "שולחים קוד…" : "שליחת קוד אימות לדוא״ל")}
            </button>
          ) : (
            <form
              className="portal-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action("verify");
              }}
            >
              <label>
                {t("קוד אימות בן שש ספרות")}
                <input
                  className="otp-input"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </label>
              <button
                className="button button-dark"
                disabled={busy || code.length !== 6}
              >
                {t("אימות ופתיחת הדוח")}
              </button>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void action("request")}
              >
                {t("שליחת קוד חדש")}
              </button>
            </form>
          )}
        </section>
      ) : !error ? (
        <p role="status">{t("בודקים את זמינות הדוח…")}</p>
      ) : null}
    </div>
  );
}
