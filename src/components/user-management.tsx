"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Users, RefreshCw } from "lucide-react";
import { OWNER_EMAIL } from "@/lib/portal/staff-access";
import type { Staff, StaffStatus } from "@/lib/portal/types";
const statuses: Record<StaffStatus, string> = {
  pending: "ממתין לאישור",
  active: "גישה מאושרת",
  suspended: "גישה מושהית",
  rejected: "בקשה נדחתה",
};
export function UserManagement({ initialUsers }: { initialUsers: Staff[] }) {
  const { t, locale } = useLanguage();

  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<{
    user: Staff;
    status: "suspended" | "rejected";
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  async function refresh() {
    setBusy("refresh");
    setError("");
    try {
      const r = await fetch("/api/clinic/users");
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setUsers(data.users);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function update(
    user: Staff,
    status: "active" | "suspended" | "rejected",
  ) {
    setBusy(user.id);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/clinic/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, status, role: user.role }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      setUsers(data.users);
      setConfirmation(null);
      setMessage(
        status === "active"
          ? t("הגישה למרפאה אושרה.")
          : t("הגישה בוטלה והכניסות הפעילות נסגרו."),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const pending = users.filter((v) => v.status === "pending").length;
  return (
    <section className="user-management">
      <Link href="/admin" className="back-link">
        <ArrowRight size={18} />
        {t("חזרה לסביבת המרפאה")}
      </Link>
      <div className="management-heading">
        <div>
          <span className="eyebrow">{t("מנהל המערכת")}</span>
          <h1>{t("צוות המרפאה")}</h1>
          <p className="panel-description">
            {t("אשרו בקשות גישה ובחרו הרשאה לכל חבר צוות.")}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label={t("רענון המשתמשים")}
          onClick={() => void refresh()}
          disabled={!!busy}
        >
          <RefreshCw size={20} />
        </button>
      </div>
      <div className="management-summary">
        <ShieldCheck size={22} />
        <div>
          <strong>
            {t("מנהל יחיד:")} <bdi>{OWNER_EMAIL}</bdi>
          </strong>
          <p>
            {t("חשבון זה מוגן משינוי ומהסרה. רק אתם יכולים לאשר צוות חדש.")}
          </p>
        </div>
      </div>
      <p className="pending-count">
        <Users size={20} />
        {pending
          ? pending + t(" בקשות ממתינות לאישור")
          : t("אין בקשות חדשות כרגע")}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {message && (
        <p className="info-box" role="status">
          {t(message)}
        </p>
      )}
      <div className="staff-list">
        {users.map((user) => (
          <article className="staff-card" key={user.id}>
            <div className="staff-card-identity">
              <strong dir="ltr">{user.email}</strong>
              <span className={"staff-status status-" + user.status}>
                {t(statuses[user.status])}
              </span>
              <small>
                {user.email === OWNER_EMAIL
                  ? t("מנהל המערכת")
                  : t("בקשת גישה: ") +
                    new Date(user.created_at).toLocaleDateString(locale)}
              </small>
            </div>
            {user.email === OWNER_EMAIL ? (
              <span className="owner-lock">
                <ShieldCheck size={18} />
                {t("חשבון מוגן")}
              </span>
            ) : (
              <div className="staff-card-controls">
                <label>
                  {t("הרשאה")}
                  <select
                    aria-label={t("הרשאה עבור ") + user.email}
                    value={user.role}
                    disabled={!!busy}
                    onChange={(e) =>
                      setUsers(
                        users.map((v) =>
                          v.id === user.id
                            ? {
                                ...v,
                                role: e.target.value as
                                  "secretary" | "professor",
                              }
                            : v,
                        ),
                      )
                    }
                  >
                    <option value="secretary">{t("מזכירות")}</option>
                    <option value="professor">{t("רופא / פרופסור")}</option>
                  </select>
                </label>
                <div className="staff-actions">
                  <button
                    className="button button-dark"
                    disabled={!!busy}
                    onClick={() => void update(user, "active")}
                  >
                    {busy === user.id
                      ? t("שומרים…")
                      : user.status === "active"
                        ? t("שמירת הרשאה")
                        : user.status === "pending"
                          ? t("אישור גישה")
                          : t("החזרת גישה")}
                  </button>
                  {user.status === "pending" && (
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        setConfirmation({ user, status: "rejected" })
                      }
                    >
                      {t("דחיית הבקשה")}
                    </button>
                  )}
                  {user.status === "active" && (
                    <button
                      className="text-button danger-text"
                      disabled={!!busy}
                      onClick={() =>
                        setConfirmation({ user, status: "suspended" })
                      }
                    >
                      {t("השהיית גישה")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="management-confirm"
        aria-labelledby="confirm-title"
        onCancel={() => setConfirmation(null)}
      >
        {confirmation && (
          <>
            <div className="patient-panel">
              <h2 id="confirm-title">
                {confirmation.status === "suspended"
                  ? t("להשהות את הגישה?")
                  : t("לדחות את הבקשה?")}
              </h2>
              <p>
                <bdi>{confirmation.user.email}</bdi>
              </p>
              <p>
                {t(
                  "החשבון לא יוכל לגשת למסמכי המרפאה. כל הכניסות הפעילות שלו ייסגרו.",
                )}
              </p>
              <div className="staff-actions">
                <button
                  className="button button-dark"
                  disabled={!!busy}
                  onClick={() =>
                    void update(confirmation.user, confirmation.status)
                  }
                >
                  {t("אישור ביטול הגישה")}
                </button>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => setConfirmation(null)}
                >
                  {t("חזרה")}
                </button>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {t(error)}
                </p>
              )}
            </div>
          </>
        )}
      </dialog>
      <p className="form-note">
        {t(
          "כדי להצטרף לצוות, יש להיכנס בעמוד המרפאה ולאמת כתובת דוא״ל. הבקשה תופיע כאן לאחר האימות. מזכירות ורופא יכולים לנהל ביקורים ומסמכים; ניהול משתמשים זמין רק לכם.",
        )}
      </p>
    </section>
  );
}
