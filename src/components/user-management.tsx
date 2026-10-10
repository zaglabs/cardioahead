"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Users,
  RefreshCw,
  Trash2,
  Search,
} from "lucide-react";
import { OWNER_EMAIL } from "@/lib/portal/staff-access";
import type { Staff, StaffStatus } from "@/lib/portal/types";
const statuses: Record<StaffStatus, string> = {
  pending: "ממתין לאישור",
  active: "גישה מאושרת",
  suspended: "גישה מושהית",
  rejected: "בקשה נדחתה",
};
type Confirmation = {
  user: Staff;
  status: "suspended" | "rejected" | "delete";
};
export function UserManagement({ initialUsers }: { initialUsers: Staff[] }) {
  const { t, locale } = useLanguage();
  const [users, setUsers] = useState(initialUsers),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmation]);
  async function refresh() {
    setBusy("refresh");
    setError("");
    try {
      const response = await fetch("/api/clinic/users", { cache: "no-store" }),
        data = await response.json();
      if (!response.ok) throw new Error(data.message);
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
      const response = await fetch("/api/clinic/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: user.id, status, role: user.role }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.message);
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
  async function remove(user: Staff) {
    setBusy(user.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/clinic/users", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: user.id,
            email: user.email,
            confirmed: true,
          }),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setUsers(data.users);
      setConfirmation(null);
      setMessage(t("המשתמש נמחק והכניסות שלו נסגרו. הרשומות הקליניות נשמרו."));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const pending = users.filter((user) => user.status === "pending").length;
  const filtered = users.filter(
    (user) =>
      user.email.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || user.status === filter),
  );
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
          disabled={!!busy}
          onClick={() => void refresh()}
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
      <div className="staff-table-tools">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label={t("חיפוש משתמש")}
            placeholder={t("חיפוש לפי דוא״ל")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label>
          {t("מצב חשבון")}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">{t("הכול")}</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="staff-table-mobile-hint">
        {t("גללו הצידה כדי לראות את כל העמודות והפעולות.")}
      </p>
      <div
        className="staff-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={t("טבלת צוות המרפאה")}
      >
        <table className="staff-table">
          <caption className="sr-only">
            {t("משתמשים, תפקידים והרשאות גישה")}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("כתובת דוא״ל")}</th>
              <th scope="col">{t("תפקיד")}</th>
              <th scope="col">{t("מצב חשבון")}</th>
              <th scope="col">{t("תאריך הצטרפות")}</th>
              <th scope="col">{t("פעולות")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr className="staff-row" key={user.id}>
                <th scope="row">
                  <bdi>{user.email}</bdi>
                </th>
                <td>
                  {user.email === OWNER_EMAIL ? (
                    <span className="role-label">{t("מנהל המערכת")}</span>
                  ) : (
                    <select
                      value={user.role}
                      disabled={!!busy}
                      aria-label={t("הרשאה עבור ") + user.email}
                      onChange={(event) =>
                        setUsers((current) =>
                          current.map((value) =>
                            value.id === user.id
                              ? {
                                  ...value,
                                  role: event.target.value as
                                    "secretary" | "professor",
                                }
                              : value,
                          ),
                        )
                      }
                    >
                      <option value="secretary">{t("מזכירות")}</option>
                      <option value="professor">{t("רופא / פרופסור")}</option>
                    </select>
                  )}
                </td>
                <td>
                  <span className={"staff-status status-" + user.status}>
                    {t(statuses[user.status])}
                  </span>
                </td>
                <td>
                  <time>
                    {new Date(user.created_at).toLocaleDateString(locale)}
                  </time>
                </td>
                <td>
                  {user.email === OWNER_EMAIL ? (
                    <span className="owner-lock">
                      <ShieldCheck size={18} />
                      {t("חשבון מוגן")}
                    </span>
                  ) : (
                    <div className="staff-actions">
                      <button
                        className="button button-dark button-small"
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
                          onClick={() => {
                            setError("");
                            setConfirmation({ user, status: "rejected" });
                          }}
                        >
                          {t("דחיית הבקשה")}
                        </button>
                      )}
                      {user.status === "active" && (
                        <button
                          className="text-button danger-text"
                          disabled={!!busy}
                          onClick={() => {
                            setError("");
                            setConfirmation({ user, status: "suspended" });
                          }}
                        >
                          {t("השהיית גישה")}
                        </button>
                      )}
                      <button
                        className="text-button danger-text"
                        disabled={!!busy}
                        onClick={() => {
                          setError("");
                          setConfirmation({ user, status: "delete" });
                        }}
                      >
                        <Trash2 size={16} />
                        {t("מחיקת משתמש")}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5} className="empty-state">
                  {t("לא נמצאו משתמשים בסינון הזה.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <dialog
        ref={dialog}
        className="management-confirm"
        aria-labelledby="confirm-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setConfirmation(null);
        }}
      >
        {confirmation && (
          <div className="patient-panel">
            <h2 id="confirm-title">
              {confirmation.status === "delete"
                ? t("למחוק את המשתמש?")
                : confirmation.status === "suspended"
                  ? t("להשהות את הגישה?")
                  : t("לדחות את הבקשה?")}
            </h2>
            <p>
              <bdi>{confirmation.user.email}</bdi>
            </p>
            <p>
              {confirmation.status === "delete"
                ? t(
                    "חשבון המשתמש והכניסות שלו יימחקו. תיקי המטופלים וההיסטוריה הקלינית יישמרו. כניסה עתידית תדרוש אישור מחדש.",
                  )
                : t(
                    "החשבון לא יוכל לגשת למסמכי המרפאה. כל הכניסות הפעילות שלו ייסגרו.",
                  )}
            </p>
            <div className="staff-actions">
              <button
                className={
                  confirmation.status === "delete"
                    ? "button button-danger"
                    : "button button-dark"
                }
                disabled={!!busy}
                onClick={() =>
                  confirmation.status === "delete"
                    ? void remove(confirmation.user)
                    : void update(confirmation.user, confirmation.status)
                }
              >
                {confirmation.status === "delete"
                  ? t("אישור מחיקת המשתמש")
                  : t("אישור ביטול הגישה")}
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
