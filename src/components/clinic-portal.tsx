"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/portal/staff-access";
import {
  CalendarDays,
  Check,
  Clock3,
  FileText,
  Heart,
  LayoutDashboard,
  Link2,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  ArrowDownToLine,
  X,
  Copy,
} from "lucide-react";
import type { AppointmentView, Staff } from "@/lib/portal/types";
const labels = {
  invited: "ממתין למסמכים",
  submitted: "התקבל במרפאה",
  reviewed: "נבדק",
} as const;
export function ClinicPortal({
  staff,
  initialAppointments,
}: {
  staff: Staff;
  initialAppointments: AppointmentView[];
}) {
  const [appointments, setAppointments] =
    useState<AppointmentView[]>(initialAppointments);
  const [selected, setSelected] = useState<string | null>(
    initialAppointments[0]?.id || null,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState<"documents" | "report">("documents");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("מטופל בדיקה 001");
  const [date, setDate] = useState("");
  const [invitation, setInvitation] = useState<{
    invitationUrl: string;
    code: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const router = useRouter();
  const active = appointments.find((a) => a.id === selected);
  async function api(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    return data;
  }
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/clinic/appointments", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setAppointments(data.appointments);
      setSelected((current) => current || data.appointments[0]?.id || null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא הצלחנו לטעון את הביקורים.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/clinic/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientLabel: name,
          appointmentAt: date ? new Date(date).toISOString() : null,
        }),
      });
      setInvitation(data);
      setSelected(data.appointment.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "יצירת ההזמנה לא הושלמה.");
    } finally {
      setBusy(false);
    }
  }
  async function update(action: "revoke" | "review") {
    if (!active) return;
    if (
      action === "revoke" &&
      !window.confirm(
        "לבטל את קישור הגישה לביקור? המסמכים שכבר התקבלו יישארו במרפאה.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("/api/clinic/appointments/" + active.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "עדכון הביקור לא הושלם.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/api/clinic/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "לא הצלחנו לצאת.");
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("אפשר לסמן ולהעתיק את הטקסט ידנית.");
    }
  }
  const filtered = appointments.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      a.patient_label.includes(query),
  );
  return (
    <div className="clinic-layout">
      <aside className="clinic-sidebar">
        <span className="eyebrow">פרופ׳ אלעד מאור</span>
        <h2>סביבת המרפאה</h2>
        <div className="sidebar-selected">
          <LayoutDashboard size={18} /> הכנה לביקורים
        </div>
        <div className="clinic-sidebar-bottom">
          <span className="avatar">מ</span>
          <div>
            <strong>צוות המרפאה</strong>
            <small dir="ltr">{staff.email}</small>
          </div>
        </div>
      </aside>
      <div className="clinic-workspace">
        <div className="clinic-heading">
          <div>
            <span className="eyebrow">תמונת מצב לפני הפגישה</span>
            <h1>הביקורים הקרובים.</h1>
            <p>הזמנות אישיות, מסמכים שהתקבלו ומעקב אחר ההכנה.</p>
          </div>
          <div className="clinic-tools">
            {isAdmin(staff) && (
              <Link href="/admin/users" className="admin-area-link">
                <ShieldCheck size={16} />
                ניהול משתמשים
              </Link>
            )}
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label="רענון הביקורים"
            >
              <RefreshCw size={19} />
            </button>
            <button
              className="button button-dark button-small"
              onClick={() => {
                setShowForm(!showForm);
                setInvitation(null);
                setCopied("");
              }}
              aria-expanded={showForm}
            >
              <Link2 size={16} /> הזמנה חדשה
            </button>
            <button
              className="icon-button"
              onClick={logout}
              disabled={busy}
              aria-label="יציאה מהמרפאה"
            >
              <LogOut size={19} />
            </button>
          </div>
        </div>
        <div className="info-box pilot-note">
          <ShieldCheck size={20} />
          <p>
            שלב בדיקות: יוצרים ביקורים פיקטיביים ומעלים את מסמכי הבדיקה בלבד.
          </p>
        </div>
        {showForm && (
          <section className="invitation-preview">
            <div>
              <strong>הזמנה אישית למטופל</strong>
              <button
                className="icon-button"
                onClick={() => setShowForm(false)}
                aria-label="סגירת טופס ההזמנה"
              >
                <X size={18} />
              </button>
            </div>
            {!invitation ? (
              <form className="portal-form invitation-form" onSubmit={create}>
                <label>
                  שם / כינוי המטופל
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={100}
                    autoComplete="off"
                  />
                </label>
                <label>
                  מועד ביקור
                  <input
                    type="datetime-local"
                    dir="ltr"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button className="button button-dark" disabled={busy}>
                  {busy ? "יוצרים הזמנה…" : "יצירת קישור וקוד גישה"}
                  <Link2 size={17} />
                </button>
              </form>
            ) : (
              <div className="created-invitation">
                <p>
                  ההזמנה תקפה לשבעה ימים. העתיקו עכשיו את הקישור והקוד; הם לא
                  יוצגו שוב לאחר סגירת המסך.
                </p>
                <label>
                  קישור אישי
                  <input dir="ltr" readOnly value={invitation.invitationUrl} />
                </label>
                <button
                  className="text-button"
                  onClick={() => copy(invitation.invitationUrl, "הקישור הועתק")}
                >
                  <Copy size={16} /> העתקת קישור
                </button>
                <label>
                  קוד גישה
                  <input
                    dir="ltr"
                    className="invitation-code"
                    readOnly
                    value={invitation.code}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => copy(invitation.code, "הקוד הועתק")}
                >
                  <Copy size={16} /> העתקת קוד
                </button>
                <p className="form-note">
                  מומלץ להעביר את הקוד למטופל בנפרד מהקישור.
                </p>
                <span aria-live="polite">{copied}</span>
              </div>
            )}
          </section>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="stat-grid">
          <div>
            <span>ביקורים</span>
            <strong>{appointments.length}</strong>
            <Clock3 size={19} />
          </div>
          <div>
            <span>התקבלו במרפאה</span>
            <strong>
              {appointments.filter((a) => a.status === "submitted").length}
            </strong>
            <Check size={19} />
          </div>
          <div>
            <span>מסמכים</span>
            <strong>
              {appointments.reduce((n, a) => n + a.documents.length, 0)}
            </strong>
            <FileText size={19} />
          </div>
        </div>
        <div className="case-board">
          <section className="cases-panel" aria-label="רשימת ביקורים">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="חיפוש מטופל"
                placeholder="חיפוש מטופל"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="case-filters">
              {[
                { value: "all", label: "הכול" },
                { value: "submitted", label: "התקבל" },
                { value: "invited", label: "ממתין" },
                { value: "reviewed", label: "נבדק" },
              ].map((item) => (
                <button
                  key={item.value}
                  className={filter === item.value ? "active" : ""}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="case-list">
              {filtered.map((a) => (
                <button
                  className={"case-card " + (selected === a.id ? "active" : "")}
                  key={a.id}
                  onClick={() => {
                    setSelected(a.id);
                    setTab("documents");
                  }}
                >
                  <span className="case-time">
                    {a.appointment_at
                      ? new Date(a.appointment_at).toLocaleDateString("he-IL", {
                          day: "numeric",
                          month: "numeric",
                        })
                      : "—"}
                  </span>
                  <span className="case-info">
                    <strong>{a.patient_label}</strong>
                    <small>{a.documents.length} מסמכים</small>
                    <span
                      className={
                        "badge " +
                        (a.status === "submitted" ? "badge-ready" : "")
                      }
                    >
                      {a.revoked_at ? "הגישה בוטלה" : labels[a.status]}
                    </span>
                  </span>
                </button>
              ))}
              {!filtered.length && (
                <p className="empty-state">
                  {loading
                    ? "טוענים את הביקורים…"
                    : appointments.length
                      ? "לא נמצאו ביקורים בסינון הזה."
                      : "עדיין אין ביקורים. צרו הזמנה ראשונה כדי להתחיל."}
                </p>
              )}
            </div>
          </section>
          <section className="case-detail" aria-label="תיק ביקור">
            {active ? (
              <>
                <div className="detail-heading">
                  <div>
                    <h2>{active.patient_label}</h2>
                    <span>
                      {active.appointment_at
                        ? new Date(active.appointment_at).toLocaleString(
                            "he-IL",
                            { dateStyle: "long", timeStyle: "short" },
                          )
                        : "טרם נקבע מועד ביקור"}
                    </span>
                  </div>
                  <span className="badge">{labels[active.status]}</span>
                </div>
                <div
                  className="detail-tabs"
                  role="tablist"
                  aria-label="תוכן תיק הביקור"
                >
                  <button
                    role="tab"
                    aria-selected={tab === "documents"}
                    onClick={() => setTab("documents")}
                    className={tab === "documents" ? "active" : ""}
                  >
                    <FileText size={15} /> מסמכים ({active.documents.length})
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "report"}
                    onClick={() => setTab("report")}
                    className={tab === "report" ? "active" : ""}
                  >
                    <Heart size={15} /> סיכום לקראת הביקור
                  </button>
                </div>
                <div className="report-panel">
                  {tab === "documents" ? (
                    <>
                      <p className="form-note">
                        {active.status === "invited"
                          ? "המטופל עדיין מכין את התיק. המסמכים שכבר נשמרו מופיעים כאן."
                          : "המסמכים זמינים לעיון צוות המרפאה."}
                      </p>
                      <div className="document-options">
                        {active.documents.map((d) => (
                          <a
                            className="document-preview-row"
                            target="_blank"
                            rel="noreferrer"
                            href={"/api/clinic/documents/" + d.id}
                            key={d.id}
                          >
                            <FileText size={21} />
                            <div>
                              <strong dir="auto">{d.filename}</strong>
                              <small>
                                {Math.ceil(d.bytes / 1024)} KB ·{" "}
                                {new Date(d.created_at).toLocaleDateString(
                                  "he-IL",
                                )}
                              </small>
                            </div>
                            <ArrowDownToLine size={18} />
                          </a>
                        ))}
                      </div>
                      {!active.documents.length && (
                        <div className="empty-report">
                          <FileText size={30} />
                          <h3>ממתינים למסמכים.</h3>
                          <p>הקבצים שהמטופל יעלה דרך ההזמנה יופיעו כאן.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-report">
                      <Heart size={30} />
                      <h3>סיכום המסמכים יתווסף כאן.</h3>
                      <p>
                        השלב הבא הוא קריאת המסמכים והכנת טיוטה במבנה שיספק פרופ׳
                        מאור. כרגע נשמרים ומוצגים קובצי המקור.
                      </p>
                    </div>
                  )}
                  <div className="case-actions">
                    {active.status === "submitted" && (
                      <button
                        className="button button-dark button-small"
                        onClick={() => void update("review")}
                        disabled={busy}
                      >
                        סימון כנבדק
                        <Check size={16} />
                      </button>
                    )}
                    {!active.revoked_at && (
                      <button
                        className="text-button"
                        onClick={() => void update("revoke")}
                        disabled={busy}
                      >
                        ביטול קישור הגישה
                      </button>
                    )}
                    {active.revoked_at && (
                      <span className="form-note">
                        קישור הגישה בוטל. המסמכים נשמרו בתיק.
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-report">
                <CalendarDays size={30} />
                <h2>ההכנה לביקור מתחילה כאן.</h2>
                <p>בחרו ביקור מהרשימה, או צרו הזמנה חדשה.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
