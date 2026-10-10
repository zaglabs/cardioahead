"use client";
import { useLanguage } from "@/components/language-provider";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClinicalInsights } from "./clinical-insights";
import {
  DocumentPreviewProvider,
  useDocumentPreview,
} from "./document-preview";
import { ClinicDocumentUpload } from "./clinic-document-upload";
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
  Eye,
  Plus,
  X,
  Copy,
} from "lucide-react";
import type { AppointmentView, Staff } from "@/lib/portal/types";
const labels = {
  invited: "ממתין למסמכים",
  submitted: "התקבל במרפאה",
  reviewed: "נבדק",
} as const;
export function ClinicPortal(props: {
  staff: Staff;
  initialAppointments: AppointmentView[];
}) {
  return (
    <DocumentPreviewProvider>
      <ClinicWorkspace {...props} />
    </DocumentPreviewProvider>
  );
}
function ClinicWorkspace({
  staff,
  initialAppointments,
}: {
  staff: Staff;
  initialAppointments: AppointmentView[];
}) {
  const { t, locale } = useLanguage();
  const openDocument = useDocumentPreview();
  const [formMode, setFormMode] = useState<"invitation" | "clinic">(
    "invitation",
  );

  const [appointments, setAppointments] =
    useState<AppointmentView[]>(initialAppointments);
  const [selected, setSelected] = useState<string | null>(
    initialAppointments[0]?.id || null,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState<"documents" | "report" | "presentation">(
    "documents",
  );
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(t("מטופל בדיקה 001"));
  const [date, setDate] = useState("");
  const [invitationLanguage, setInvitationLanguage] = useState<"he" | "en">(
    "he",
  );
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
      setError(
        e instanceof Error ? e.message : t("לא הצלחנו לטעון את הביקורים."),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);
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
          mode: formMode,
          language: invitationLanguage,
          appointmentAt: date ? new Date(date).toISOString() : null,
        }),
      });
      if (formMode === "clinic") {
        setShowForm(false);
        setTab("documents");
      } else setInvitation(data);
      setSelected(data.appointment.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("יצירת ההזמנה לא הושלמה."));
    } finally {
      setBusy(false);
    }
  }
  async function update(action: "revoke" | "review") {
    if (!active) return;
    if (
      action === "revoke" &&
      !window.confirm(
        t("לבטל את קישור הגישה לביקור? המסמכים שכבר התקבלו יישארו במרפאה."),
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
      setError(e instanceof Error ? e.message : t("עדכון הביקור לא הושלם."));
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
      setError(e instanceof Error ? e.message : t("לא הצלחנו לצאת."));
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(t("אפשר לסמן ולהעתיק את הטקסט ידנית."));
    }
  }
  function statusLabel(a: AppointmentView) {
    return a.intake_mode === "clinic" && a.status === "invited"
      ? t("טיוטה במרפאה")
      : a.intake_mode !== "clinic" && a.revoked_at
        ? t("הגישה בוטלה")
        : t(labels[a.status]);
  }
  const filtered = appointments.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      a.patient_label.includes(query),
  );
  return (
    <div className="clinic-layout">
      <aside className="clinic-sidebar">
        <span className="eyebrow">{t("פרופ׳ אלעד מאור")}</span>
        <h2>{t("סביבת המרפאה")}</h2>
        <div className="sidebar-selected">
          <LayoutDashboard size={18} />
          {t("הכנה לביקורים")}
        </div>
        <div className="clinic-sidebar-bottom">
          <span className="avatar">{t("מ")}</span>
          <div>
            <strong>{t("צוות המרפאה")}</strong>
            <small dir="ltr">{staff.email}</small>
          </div>
        </div>
      </aside>
      <div className="clinic-workspace">
        <div className="clinic-heading">
          <div>
            <span className="eyebrow">{t("תמונת מצב לפני הפגישה")}</span>
            <h1>{t("הביקורים הקרובים.")}</h1>
            <p>{t("הזמנות אישיות, מסמכים שהתקבלו ומעקב אחר ההכנה.")}</p>
          </div>
          <div className="clinic-tools">
            {isAdmin(staff) && (
              <Link href="/admin/users" className="admin-area-link">
                <ShieldCheck size={16} />
                {t("ניהול משתמשים")}
              </Link>
            )}
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label={t("רענון הביקורים")}
            >
              <RefreshCw size={19} />
            </button>
            <button
              className="button button-dark button-small"
              onClick={() => {
                setFormMode("invitation");
                setShowForm(!showForm);
                setInvitation(null);
                setCopied("");
              }}
              aria-expanded={showForm}
            >
              <Link2 size={16} />
              {t("הזמנה חדשה")}
            </button>
            <button
              className="button button-outline button-small"
              onClick={() => {
                setFormMode("clinic");
                setShowForm(true);
                setInvitation(null);
                setName("");
                setCopied("");
              }}
            >
              <Plus size={17} />
              {t("תיק מטופל חדש")}
            </button>
            <button
              className="icon-button"
              onClick={logout}
              disabled={busy}
              aria-label={t("יציאה מהמרפאה")}
            >
              <LogOut size={19} />
            </button>
          </div>
        </div>
        <div className="info-box pilot-note">
          <ShieldCheck size={20} />
          <p>
            {t(
              "שלב בדיקות: יוצרים ביקורים פיקטיביים ומעלים את מסמכי הבדיקה בלבד.",
            )}
          </p>
        </div>
        {showForm && (
          <section className="invitation-preview">
            <div>
              <strong>
                {formMode === "clinic"
                  ? t("פתיחת תיק מטופל במרפאה")
                  : t("הזמנה אישית למטופל")}
              </strong>
              <button
                className="icon-button"
                onClick={() => setShowForm(false)}
                aria-label={t("סגירת טופס ההזמנה")}
              >
                <X size={18} />
              </button>
            </div>
            {!invitation ? (
              <form className="portal-form invitation-form" onSubmit={create}>
                <label>
                  {t("שם / כינוי המטופל")}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={100}
                    autoComplete="off"
                  />
                </label>
                <label>
                  {t("מועד ביקור")}
                  <input
                    type="datetime-local"
                    dir="ltr"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                {formMode === "invitation" && (
                  <label>
                    {t("שפת ההזמנה")}
                    <select
                      value={invitationLanguage}
                      onChange={(e) =>
                        setInvitationLanguage(
                          e.target.value === "en" ? "en" : "he",
                        )
                      }
                    >
                      <option value="he">עברית</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                )}
                <button className="button button-dark" disabled={busy}>
                  {busy
                    ? t("יוצרים הזמנה…")
                    : formMode === "clinic"
                      ? t("פתיחת תיק")
                      : t("יצירת קישור וקוד גישה")}
                  <Link2 size={17} />
                </button>
              </form>
            ) : (
              <div className="created-invitation">
                <p>
                  {t(
                    "ההזמנה תקפה לשבעה ימים. העתיקו עכשיו את הקישור והקוד; הם לא יוצגו שוב לאחר סגירת המסך.",
                  )}
                </p>
                <label>
                  {t("קישור אישי")}
                  <input dir="ltr" readOnly value={invitation.invitationUrl} />
                </label>
                <button
                  className="text-button"
                  onClick={() =>
                    copy(invitation.invitationUrl, t("הקישור הועתק"))
                  }
                >
                  <Copy size={16} />
                  {t("העתקת קישור")}
                </button>
                <label>
                  {t("קוד גישה")}
                  <input
                    dir="ltr"
                    className="invitation-code"
                    readOnly
                    value={invitation.code}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() => copy(invitation.code, t("הקוד הועתק"))}
                >
                  <Copy size={16} />
                  {t("העתקת קוד")}
                </button>
                <p className="form-note">
                  {t("מומלץ להעביר את הקוד למטופל בנפרד מהקישור.")}
                </p>
                <span aria-live="polite">{t(copied)}</span>
              </div>
            )}
          </section>
        )}
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="stat-grid">
          <div>
            <span>{t("ביקורים")}</span>
            <strong>{appointments.length}</strong>
            <Clock3 size={19} />
          </div>
          <div>
            <span>{t("התקבלו במרפאה")}</span>
            <strong>
              {appointments.filter((a) => a.status === "submitted").length}
            </strong>
            <Check size={19} />
          </div>
          <div>
            <span>{t("מסמכים")}</span>
            <strong>
              {appointments.reduce((n, a) => n + a.documents.length, 0)}
            </strong>
            <FileText size={19} />
          </div>
        </div>
        <div className="case-board">
          <section className="cases-panel" aria-label={t("רשימת ביקורים")}>
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label={t("חיפוש מטופל")}
                placeholder={t("חיפוש מטופל")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="case-filters">
              {[
                { value: "all", label: t("הכול") },
                { value: "submitted", label: t("התקבל") },
                { value: "invited", label: t("ממתין") },
                { value: "reviewed", label: t("נבדק") },
              ].map((item) => (
                <button
                  key={item.value}
                  className={filter === item.value ? "active" : ""}
                  onClick={() => setFilter(item.value)}
                >
                  {t(item.label)}
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
                      ? new Date(a.appointment_at).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "numeric",
                        })
                      : "—"}
                  </span>
                  <span className="case-info">
                    <strong>{a.patient_label}</strong>
                    <small>
                      {a.documents.length}
                      {t(" מסמכים")}
                    </small>
                    <span
                      className={
                        "badge " +
                        (a.status === "submitted" ? "badge-ready" : "")
                      }
                    >
                      {statusLabel(a)}
                    </span>
                  </span>
                </button>
              ))}
              {!filtered.length && (
                <p className="empty-state">
                  {loading
                    ? t("טוענים את הביקורים…")
                    : appointments.length
                      ? t("לא נמצאו ביקורים בסינון הזה.")
                      : t("עדיין אין ביקורים. צרו הזמנה ראשונה כדי להתחיל.")}
                </p>
              )}
            </div>
          </section>
          <section className="case-detail" aria-label={t("תיק ביקור")}>
            {active ? (
              <>
                <div className="detail-heading">
                  <div>
                    <h2>{active.patient_label}</h2>
                    <span>
                      {active.appointment_at
                        ? new Date(active.appointment_at).toLocaleString(
                            locale,
                            { dateStyle: "long", timeStyle: "short" },
                          )
                        : t("טרם נקבע מועד ביקור")}
                    </span>
                  </div>
                  <span className="badge">{statusLabel(active)}</span>
                </div>
                <div
                  className="detail-tabs"
                  role="tablist"
                  aria-label={t("תוכן תיק הביקור")}
                >
                  <button
                    role="tab"
                    aria-selected={tab === "documents"}
                    onClick={() => setTab("documents")}
                    className={tab === "documents" ? "active" : ""}
                  >
                    <FileText size={15} />
                    {t(" מסמכים (")}
                    {active.documents.length})
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "report"}
                    onClick={() => setTab("report")}
                    className={tab === "report" ? "active" : ""}
                  >
                    <Heart size={15} />
                    {t("סיכום לקראת הביקור")}
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "presentation"}
                    onClick={() => setTab("presentation")}
                    className={tab === "presentation" ? "active" : ""}
                  >
                    <Heart size={15} />
                    {t("המחשה / מצגת")}
                  </button>
                </div>
                <div className="report-panel">
                  {tab === "documents" ? (
                    <>
                      <p className="form-note">
                        {active.intake_mode === "clinic"
                          ? t("תיק זה נפתח במרפאה, ללא קישור הזמנה למטופל.")
                          : active.status === "invited"
                            ? t(
                                "המטופל עדיין מכין את התיק. המסמכים שכבר נשמרו מופיעים כאן.",
                              )
                            : t("המסמכים זמינים לעיון צוות המרפאה.")}
                      </p>
                      <div className="document-options">
                        {active.documents.map((d) => (
                          <button
                            className="document-preview-row"
                            type="button"
                            onClick={() =>
                              openDocument({ id: d.id, filename: d.filename })
                            }
                            key={d.id}
                          >
                            <FileText size={21} />
                            <div>
                              <strong dir="auto">{d.filename}</strong>
                              <small>
                                {Math.ceil(d.bytes / 1024)} KB ·{" "}
                                {new Date(d.created_at).toLocaleDateString(
                                  locale,
                                )}
                              </small>
                            </div>
                            <Eye size={18} />
                          </button>
                        ))}
                      </div>
                      {active.status === "invited" && (
                        <ClinicDocumentUpload
                          key={active.id}
                          appointment={active}
                          onUploaded={refresh}
                          onPrepared={() => setTab("report")}
                        />
                      )}
                      {!active.documents.length &&
                        active.status !== "invited" && (
                          <div className="empty-report">
                            <FileText size={30} />
                            <h3>{t("ממתינים למסמכים.")}</h3>
                            <p>
                              {t("הקבצים שהמטופל יעלה דרך ההזמנה יופיעו כאן.")}
                            </p>
                          </div>
                        )}
                    </>
                  ) : (
                    <ClinicalInsights
                      key={active.id}
                      appointment={active}
                      staff={staff}
                      mode={tab}
                    />
                  )}
                  <div className="case-actions">
                    {active.status === "submitted" && (
                      <button
                        className="button button-dark button-small"
                        onClick={() => void update("review")}
                        disabled={busy}
                      >
                        {t("סימון כנבדק")}
                        <Check size={16} />
                      </button>
                    )}
                    {active.intake_mode !== "clinic" && !active.revoked_at && (
                      <button
                        className="text-button"
                        onClick={() => void update("revoke")}
                        disabled={busy}
                      >
                        {t("ביטול קישור הגישה")}
                      </button>
                    )}
                    {active.intake_mode !== "clinic" && active.revoked_at && (
                      <span className="form-note">
                        {t("קישור הגישה בוטל. המסמכים נשמרו בתיק.")}
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-report">
                <CalendarDays size={30} />
                <h2>{t("ההכנה לביקור מתחילה כאן.")}</h2>
                <p>{t("בחרו ביקור מהרשימה, או צרו הזמנה חדשה.")}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
