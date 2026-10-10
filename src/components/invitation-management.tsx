"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  Copy,
  Eye,
  X,
  RefreshCw,
  Link2,
  Mail,
  Clock3,
  ShieldX,
  Trash2,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { ClinicSidebar } from "./clinic-sidebar";
import { HeartLoader } from "./heart-loader";
import { useLanguage } from "./language-provider";
import type { InvitationRow } from "@/lib/invitations/types";
import type { Staff } from "@/lib/portal/types";
type Modal = {
  row: InvitationRow;
  kind: "credentials" | "resend" | "extend" | "revoke" | "delete" | "replace";
};
export function InvitationManagement({ staff }: { staff: Staff }) {
  const { language, locale, t } = useLanguage(),
    w = (he: string, en: string) => (language === "he" ? he : en);
  const [rows, setRows] = useState<InvitationRow[]>([]),
    [total, setTotal] = useState(0),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [followup, setFollowup] = useState("all"),
    [deleted, setDeleted] = useState(false),
    [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [modal, setModal] = useState<Modal | null>(null),
    [credentials, setCredentials] = useState<{
      url: string;
      code: string;
    } | null>(null);
  const [email, setEmail] = useState(""),
    [recipientConfirmed, setRecipientConfirmed] = useState(false),
    [days, setDays] = useState("7");
  const requestId = useRef(""),
    modalRef = useRef<HTMLDivElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Jerusalem",
        })
      : w("לא נרשם", "Not recorded");
  const statusLabel = (value: string) =>
    ({
      active: w("פעילה", "Active"),
      expired: w("פגה", "Expired"),
      revoked: w("בוטלה", "Revoked"),
      deleted: w("נמחקה", "Deleted"),
    })[value] || value;
  const importLabel = (value: string) =>
    ({
      not_started: w("לא התקבל ייבוא", "No import received"),
      received: w("המקורות התקבלו", "Sources received"),
      generating: w("מכינים את הסיכום", "Preparing summary"),
      ready: w("הייבוא הושלם", "Import complete"),
      failed: w("נדרש ניסיון נוסף", "Retry needed"),
    })[value] || value;
  async function api(url: string, init?: RequestInit) {
    const r = await fetch(url, { ...init, cache: "no-store" }),
      data = await r.json();
    if (!r.ok) throw Error(t(data.message));
    return data;
  }
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const p = new URLSearchParams({
          search,
          status,
          followup,
          deleted: String(deleted),
          offset: String(offset),
        });
        const r = await fetch("/api/clinic/invitations?" + p, {
            cache: "no-store",
            signal,
          }),
          data = await r.json();
        if (!r.ok) throw Error(data.message);
        setRows(data.items);
        setTotal(data.total);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setError(
            e instanceof Error ? t(e.message) : t("לא ניתן לטעון את ההזמנות."),
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [search, status, followup, deleted, offset, t],
  );
  useEffect(() => {
    const controller = new AbortController(),
      timer = setTimeout(() => void refresh(controller.signal), 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  function close() {
    setModal(null);
    setCredentials(null);
    setEmail("");
    setRecipientConfirmed(false);
    setError("");
    returnFocus.current?.focus();
  }
  useEffect(() => {
    if (!modal) return;
    modalRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...modalRef.current!.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ];
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === modalRef.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, busy]);
  async function show(row: InvitationRow, kind: Modal["kind"]) {
    returnFocus.current = document.activeElement as HTMLElement;
    setError("");
    setMessage("");
    setCredentials(null);
    setModal({ row, kind });
    setEmail(row.last_recipient || "");
    setRecipientConfirmed(false);
    setDays("7");
    requestId.current = crypto.randomUUID();
    if (kind === "credentials") {
      setBusy(true);
      try {
        setCredentials(await api("/api/clinic/invitations/" + row.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "");
      } finally {
        setBusy(false);
      }
    }
  }
  async function copy(row: InvitationRow) {
    setBusy(true);
    setError("");
    try {
      const value = await api("/api/clinic/invitations/" + row.id);
      await navigator.clipboard.writeText(value.url);
      setMessage(w("קישור ההזמנה הועתק.", "Invitation link copied."));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : w("ההעתקה לא הושלמה.", "Copy failed."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function action() {
    if (!modal || busy) return;
    setBusy(true);
    setError("");
    const { row, kind } = modal;
    const expiry = new Date(
      Math.min(
        Date.now() + 30 * 86400000,
        Math.max(Date.now(), Date.parse(row.expires_at)) +
          Number(days) * 86400000,
      ),
    ).toISOString();
    try {
      const value = await api("/api/clinic/invitations/" + row.id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind,
          confirmed: true,
          patientLabel: row.patient_label,
          expires_at: expiry,
          email,
          confirmedRecipient: recipientConfirmed,
          request_id: requestId.current,
        }),
      });
      if (kind === "replace") {
        setCredentials({ url: value.url, code: value.code });
        setModal({ ...modal, kind: "credentials" });
        setMessage(
          w(
            "נוצר קישור חדש. הקישור והקוד הישנים בוטלו.",
            "A new link was created. The old link and code are revoked.",
          ),
        );
      } else {
        close();
        setMessage(
          kind === "resend"
            ? w(
                "שירות הדוא״ל אישר את קבלת ההודעה לשליחה. זה אינו אישור מסירה.",
                "The email service accepted the message for sending. Delivery is not yet confirmed.",
              )
            : w("ההזמנה עודכנה.", "Invitation updated."),
        );
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : w("הפעולה לא הושלמה.", "The action could not be completed."),
      );
    } finally {
      setBusy(false);
    }
  }
  const headers = [
    w("מטופל", "Patient"),
    w("קישור וקוד", "Link & code"),
    w("הנפקה", "Issued"),
    w("גישה של המטופל", "Patient activity"),
    w("העלאת מסמכים", "Uploads"),
    w("חשבון כללית", "Clalit account"),
    w("ייבוא מכללית", "Clalit import"),
    w("תוקף ומצב", "Expiry & status"),
    w("פעולות", "Actions"),
  ];
  return (
    <div className="clinic-layout invitations-layout">
      <ClinicSidebar staff={staff} active="invitations" />
      <section className="clinic-workspace invitation-management">
        <div className="clinic-heading">
          <div>
            <span className="eyebrow">
              {w("מעקב צוות המרפאה", "Clinic staff tracking")}
            </span>
            <h1>{w("קישורי הזמנה", "Invitation Links")}</h1>
            <p>
              {w(
                "מעקב אחר גישה, מסמכים וייבוא לקראת הביקור.",
                "Track patient access, documents and imports before the visit.",
              )}
            </p>
          </div>
          <div className="clinic-tools">
            <Link
              className="primary-button"
              href={"/admin?create=invitation&lang=" + language}
            >
              <Plus size={19} />
              {w("הזמנה חדשה", "New invitation")}
            </Link>
            <button
              className="icon-button"
              aria-label={w("רענון הזמנות", "Refresh invitations")}
              onClick={() => void refresh()}
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </div>
        <div className="invitation-filters">
          <label className="invitation-search">
            <span>
              {w("חיפוש מטופל או איש צוות", "Search patient or issuer")}
            </span>
            <div>
              <Search size={19} />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
                placeholder={w(
                  "שם או מזהה מטופל",
                  "Patient name or identifier",
                )}
              />
            </div>
          </label>
          <label>
            {w("מצב ההזמנה", "Invitation status")}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              {["all", "active", "expired", "revoked", "deleted"].map((s) => (
                <option key={s} value={s}>
                  {s === "all"
                    ? w("כל המצבים", "All statuses")
                    : statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {w("מעקב נדרש", "Follow-up needed")}
            <select
              value={followup}
              onChange={(e) => {
                setFollowup(e.target.value);
                setOffset(0);
              }}
            >
              {[
                ["all", w("כל ההזמנות", "All invitations")],
                ["not_opened", w("טרם אומתה כניסה", "Access not verified")],
                [
                  "no_documents",
                  w(
                    "אין מסמכים או ייבוא שהושלם",
                    "No uploads or completed import",
                  ),
                ],
                ["import_pending", w("ייבוא בתהליך", "Import in progress")],
                [
                  "import_failed",
                  w("ייבוא דורש ניסיון נוסף", "Import needs retry"),
                ],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="invitation-checkbox">
            <input
              type="checkbox"
              checked={deleted}
              onChange={(e) => {
                setDeleted(e.target.checked);
                setOffset(0);
              }}
            />
            {w("הצגת הזמנות שנמחקו", "Include deleted invitations")}
          </label>
        </div>
        <p className="invitation-tracking-note">
          {w(
            "צפייה בקישור אינה כניסה מאומתת. חיבור כללית נרשם רק לאחר שהתקבלו רשומות תקינות מהאספן; הצלחת הייבוא נרשמת כשהסיכום נשמר.",
            "Viewing a link is separate from verified access. Clalit connection is recorded only after valid records arrive from the collector; import success is recorded when the summary is saved.",
          )}
        </p>
        {message && (
          <p className="invitation-success" role="status">
            <CheckCircle2 size={20} />
            {message}
          </p>
        )}
        {error && !modal && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading && (
          <div className="invitation-loading" role="status">
            <HeartLoader />
            <span>{w("טוענים את ההזמנות", "Loading invitations")}</span>
          </div>
        )}
        <div className="invitation-table-scroll" aria-busy={loading}>
          <table className="invitation-table">
            <caption>
              {w(
                "הזמנות שהונפקו — קישורים וקודים מוצגים רק לצוות מורשה",
                "Issued invitations — links and codes are available only to authorized staff",
              )}
            </caption>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label={headers[0]}>
                    <strong>{row.patient_label}</strong>
                    <small>
                      {row.legacy
                        ? w("הזמנה קודמת", "Earlier invitation")
                        : w("הזמנה אישית", "Personal invitation")}
                    </small>
                  </td>
                  <td data-label={headers[1]}>
                    <span className="invitation-masked" dir="ltr">
                      /invite/••••••
                    </span>
                    <span className="invitation-masked" dir="ltr">
                      ••••••
                    </span>
                    {row.recoverable &&
                    !["revoked", "deleted"].includes(row.status) ? (
                      <div className="invitation-row-tools">
                        <button
                          className="text-button"
                          onClick={() => void show(row, "credentials")}
                          disabled={busy}
                        >
                          <Eye size={17} />
                          {w("הצגת קישור וקוד", "Show link & code")}
                        </button>
                        <button
                          className="icon-button"
                          disabled={busy}
                          onClick={() => void copy(row)}
                          aria-label={
                            w("העתקת קישור עבור ", "Copy link for ") +
                            row.patient_label
                          }
                        >
                          <Copy size={17} />
                        </button>
                      </div>
                    ) : (
                      <small>
                        {row.legacy
                          ? w(
                              "לשחזור נדרש קישור חדש",
                              "New link required for recovery",
                            )
                          : w("הגישה בוטלה", "Access revoked")}
                      </small>
                    )}
                  </td>
                  <td data-label={headers[2]}>
                    <span>{date(row.issued_at)}</span>
                    <small dir="auto">
                      {row.issuer_label ||
                        w("איש הצוות אינו ידוע", "Issuer not recorded")}
                    </small>
                  </td>
                  <td data-label={headers[3]}>
                    <strong>
                      {row.first_verified_at
                        ? w("כניסה אומתה", "Access verified")
                        : w("אין כניסה מאומתת", "No verified access")}
                    </strong>
                    <small>{date(row.first_verified_at)}</small>
                    {row.first_viewed_at && (
                      <small>
                        {w("צפייה ראשונה בקישור: ", "First link view: ") +
                          date(row.first_viewed_at)}
                      </small>
                    )}
                    {row.last_verified_at &&
                      row.last_verified_at !== row.first_verified_at && (
                        <small>
                          {w("כניסה אחרונה: ", "Latest access: ") +
                            date(row.last_verified_at)}
                        </small>
                      )}
                  </td>
                  <td data-label={headers[4]}>
                    <strong>
                      {row.patient_upload_count}{" "}
                      {w("מסמכים מהמטופל", "patient uploads")}
                    </strong>
                    <small>{date(row.latest_upload_at)}</small>
                    {row.card_document_count > row.patient_upload_count && (
                      <small>
                        {row.card_document_count}{" "}
                        {w("מסמכים בסך הכול בתיק", "total documents on card")}
                      </small>
                    )}
                  </td>
                  <td data-label={headers[5]}>
                    <strong>
                      {row.clalit_connected_at
                        ? w("התקבלו רשומות מכללית", "Clalit records received")
                        : w("טרם אושר חיבור", "No confirmed connection")}
                    </strong>
                    <small>{date(row.clalit_connected_at)}</small>
                  </td>
                  <td data-label={headers[6]}>
                    <strong>{importLabel(row.import_status)}</strong>
                    {row.import_record_count != null && (
                      <small>
                        {row.import_record_count}{" "}
                        {w("רשומות מקור", "source records")}
                      </small>
                    )}
                    <small>
                      {w("ייבוא מוצלח אחרון: ", "Latest successful import: ") +
                        date(row.latest_import_at)}
                    </small>
                  </td>
                  <td data-label={headers[7]}>
                    <span
                      className={"status-pill invitation-status-" + row.status}
                    >
                      {statusLabel(row.status)}
                    </span>
                    <small>{date(row.expires_at)}</small>
                    {row.last_sent_at && (
                      <small>
                        {w("נשלח מחדש: ", "Last resend: ") +
                          date(row.last_sent_at)}
                      </small>
                    )}
                  </td>
                  <td data-label={headers[8]}>
                    <div className="invitation-actions">
                      {row.status === "active" && row.recoverable && (
                        <button onClick={() => void show(row, "resend")}>
                          <Mail size={17} />
                          {w("שליחה מחדש", "Resend")}
                        </button>
                      )}
                      {["active", "expired"].includes(row.status) && (
                        <button onClick={() => void show(row, "extend")}>
                          <Clock3 size={17} />
                          {w("הארכת תוקף", "Extend expiry")}
                        </button>
                      )}
                      {["active", "expired"].includes(row.status) && (
                        <button onClick={() => void show(row, "revoke")}>
                          <ShieldX size={17} />
                          {w("ביטול גישה", "Revoke")}
                        </button>
                      )}
                      {row.status !== "deleted" && (
                        <button onClick={() => void show(row, "replace")}>
                          <Link2 size={17} />
                          {w("קישור חדש", "New link")}
                        </button>
                      )}
                      {row.status !== "deleted" && (
                        <button
                          className="danger-text"
                          onClick={() => void show(row, "delete")}
                        >
                          <Trash2 size={17} />
                          {w("מחיקת הזמנה", "Delete invitation")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && (
            <div className="invitation-empty">
              {w(
                "לא נמצאו הזמנות למסננים שבחרתם.",
                "No invitations match these filters.",
              )}
            </div>
          )}
        </div>
        <div className="invitation-pagination">
          <span>
            {total} {w("הזמנות", "invitations")}
          </span>
          <button
            className="secondary-button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            {w("הקודם", "Previous")}
          </button>
          <button
            className="secondary-button"
            disabled={offset + 50 >= total}
            onClick={() => setOffset(offset + 50)}
          >
            {w("הבא", "Next")}
          </button>
        </div>
      </section>
      {modal && (
        <div className="invitation-modal-backdrop">
          <div
            ref={modalRef}
            className="invitation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invitation-dialog-title"
            tabIndex={-1}
          >
            <button
              className="icon-button invitation-close"
              disabled={busy}
              onClick={close}
              aria-label={w("סגירה", "Close")}
            >
              <X size={22} />
            </button>
            <span className="eyebrow">{modal.row.patient_label}</span>
            <h2 id="invitation-dialog-title">
              {
                {
                  credentials: w(
                    "קישור וקוד גישה",
                    "Invitation link & access code",
                  ),
                  resend: w("שליחה מחדש למטופל", "Resend to patient"),
                  extend: w("הארכת תוקף ההזמנה", "Extend invitation expiry"),
                  revoke: w("ביטול הגישה להזמנה", "Revoke invitation access"),
                  delete: w("מחיקת ההזמנה", "Delete invitation"),
                  replace: w("יצירת קישור חדש", "Create a new invitation link"),
                }[modal.kind]
              }
            </h2>
            {busy && (
              <div className="invitation-loading" role="status">
                <HeartLoader />
                <span>{w("מעבדים את הבקשה", "Processing request")}</span>
              </div>
            )}
            {modal.kind === "credentials" && credentials && (
              <>
                <label>
                  {w("קישור אישי", "Personal link")}
                  <input
                    readOnly
                    dir="ltr"
                    value={credentials.url}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <label>
                  {w("קוד גישה", "Access code")}
                  <input
                    className="invitation-code"
                    readOnly
                    dir="ltr"
                    value={credentials.code}
                  />
                </label>
                <button
                  className="primary-button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(
                        credentials.url +
                          "\n" +
                          w("קוד גישה: ", "Access code: ") +
                          credentials.code,
                      )
                      .then(() =>
                        setMessage(
                          w("הקישור והקוד הועתקו.", "Link and code copied."),
                        ),
                      )
                  }
                >
                  <Copy size={18} />
                  {w("העתקת קישור וקוד", "Copy link and code")}
                </button>
              </>
            )}
            {modal.kind === "resend" && (
              <>
                <p>
                  {w(
                    "ההודעה כוללת את הקישור וקוד הגישה בלבד, ללא ממצאים רפואיים.",
                    "The email contains the invitation link and access code, without medical findings.",
                  )}
                </p>
                <label>
                  {w("כתובת דוא״ל של המטופל", "Patient email address")}
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={recipientConfirmed}
                    onChange={(e) => setRecipientConfirmed(e.target.checked)}
                  />
                  <span>
                    {w(
                      "בדקתי שכתובת הדוא״ל שייכת לנמען הנכון.",
                      "I checked that this is the intended recipient’s email address.",
                    )}
                  </span>
                </label>
              </>
            )}
            {modal.kind === "extend" && (
              <>
                <p>
                  {w("תוקף נוכחי: ", "Current expiry: ") +
                    date(modal.row.expires_at)}
                </p>
                <label>
                  {w("משך ההארכה", "Extension")}
                  <select
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  >
                    {["7", "14", "30"].map((value) => (
                      <option key={value} value={value}>
                        {value} {w("ימים", "days")}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {w(
                    "התוקף החדש מוגבל ל־30 ימים מהיום.",
                    "The new expiry is limited to 30 days from today.",
                  )}
                </p>
              </>
            )}
            {["revoke", "delete", "replace"].includes(modal.kind) && (
              <p>
                {modal.kind === "replace"
                  ? w(
                      "קישור וקוד חדשים יחליפו את הגישה הקיימת. יש למסור למטופל את הפרטים החדשים.",
                      "A new link and code will replace existing access. Give the patient the new details.",
                    )
                  : modal.kind === "delete"
                    ? w(
                        "ההזמנה תוסר מהרשימה הרגילה והגישה תבוטל. תיק המטופל והמידע שהתקבל נשמרים במרפאה.",
                        "The invitation will be removed from the normal list and access revoked. The patient card and received clinical information remain in the clinic.",
                      )
                    : w(
                        "הקישור והכניסות הפעילות יפסיקו לעבוד. המידע שכבר התקבל נשמר במרפאה.",
                        "The link and active sessions will stop working. Received information remains in the clinic.",
                      )}
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            {modal.kind !== "credentials" && (
              <button
                className={
                  ["delete", "revoke"].includes(modal.kind)
                    ? "danger-button"
                    : "primary-button"
                }
                disabled={
                  busy ||
                  (modal.kind === "resend" && (!recipientConfirmed || !email))
                }
                onClick={() => void action()}
              >
                {modal.kind === "resend"
                  ? w("שליחת ההזמנה", "Send invitation")
                  : w("אישור", "Confirm")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
