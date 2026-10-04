"use client";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  FileText,
  Heart,
  LayoutDashboard,
  Link2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  demoCases,
  demoDocuments,
  statusLabels,
  type DemoStatus,
} from "@/lib/demo-data";

export function ClinicDemo() {
  const [filter, setFilter] = useState<"all" | DemoStatus>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(demoCases[0].id);
  const [tab, setTab] = useState<"report" | "documents">("report");
  const [showInvitation, setShowInvitation] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const activeCase = demoCases.find((item) => item.id === selected)!;
  const cases = demoCases.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      item.label.includes(query),
  );
  function openCase(id: string) {
    setSelected(id);
    setTab("report");
    setSource(null);
  }
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
            <small>חשבון הדגמה בלבד</small>
          </div>
        </div>
      </aside>
      <div className="clinic-workspace">
        <div className="clinic-heading">
          <div>
            <span className="eyebrow">תמונת מצב לפני הפגישה</span>
            <h1>הביקורים הקרובים.</h1>
            <p>מידע פיקטיבי להדגמת סביבת העבודה</p>
          </div>
          <button
            className="button button-dark button-small"
            onClick={() => setShowInvitation(!showInvitation)}
            aria-expanded={showInvitation}
          >
            <Link2 size={16} /> הדגמת הזמנה
          </button>
        </div>
        {showInvitation && (
          <section
            className="invitation-preview"
            aria-label="הדגמת יצירת הזמנה"
          >
            <div>
              <strong>הזמנה אישית למטופל</strong>
              <button
                className="icon-button"
                onClick={() => setShowInvitation(false)}
                aria-label="סגירת ההדגמה"
              >
                <X size={17} />
              </button>
            </div>
            <p>
              בגרסה הפעילה צוות המרפאה יזין פרטי מטופל ומועד ביקור וייצור הזמנה
              מוגבלת בזמן. בהדגמה לא נוצר קישור ולא נשלחת הודעה.
            </p>
            <span className="badge">יצירת הזמנות אמיתיות טרם זמינה</span>
          </section>
        )}
        <div className="stat-grid">
          <div>
            <span>ביקורים לדוגמה</span>
            <strong>4</strong>
            <Clock3 size={19} />
          </div>
          <div>
            <span>מוכנים לעיון</span>
            <strong>2</strong>
            <Check size={19} />
          </div>
          <div>
            <span>מסמכים לדוגמה</span>
            <strong>9</strong>
            <FileText size={19} />
          </div>
        </div>
        <div className="case-board">
          <section className="cases-panel" aria-label="רשימת ביקורים">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="חיפוש ברשימת ההדגמה"
                placeholder="חיפוש מטופל לדוגמה"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="case-filters" aria-label="סינון ביקורים">
              {(
                [
                  { value: "all", label: "הכל" },
                  { value: "ready", label: "מוכן לעיון" },
                  { value: "collecting", label: "ממתין" },
                  { value: "invited", label: "הוזמן" },
                ] as const
              ).map((item) => (
                <button
                  key={item.value}
                  className={filter === item.value ? "active" : ""}
                  onClick={() => setFilter(item.value)}
                  aria-pressed={filter === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="case-list">
              {cases.map((item) => (
                <button
                  className={`case-card ${selected === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => openCase(item.id)}
                  aria-pressed={selected === item.id}
                >
                  <span className="case-time" dir="ltr">
                    {item.time}
                  </span>
                  <span className="case-info">
                    <strong>{item.label}</strong>
                    <small>
                      {item.purpose} · {item.documents} מסמכים
                    </small>
                    <span className={`badge badge-${item.status}`}>
                      {statusLabels[item.status]}
                    </span>
                  </span>
                  <ArrowLeft size={15} />
                </button>
              ))}
              {cases.length === 0 && (
                <p className="empty-state">לא נמצאו ביקורים בסינון שבחרתם.</p>
              )}
            </div>
          </section>
          <section className="case-detail" aria-label="פרטי ביקור">
            <div className="detail-heading">
              <span className="avatar">{activeCase.initials}</span>
              <div>
                <h2>{activeCase.label}</h2>
                <span>
                  {activeCase.purpose} · {activeCase.time} · נתונים פיקטיביים
                </span>
              </div>
            </div>
            <div
              className="detail-tabs"
              role="tablist"
              aria-label="תוכן הביקור"
            >
              <button
                id="report-tab"
                role="tab"
                aria-controls="report-panel"
                aria-selected={tab === "report"}
                className={tab === "report" ? "active" : ""}
                onClick={() => setTab("report")}
              >
                <Heart size={16} /> סיכום לקראת הביקור
              </button>
              <button
                id="documents-tab"
                role="tab"
                aria-controls="documents-panel"
                aria-selected={tab === "documents"}
                className={tab === "documents" ? "active" : ""}
                onClick={() => setTab("documents")}
              >
                <FileText size={16} /> מסמכים ({activeCase.documents})
              </button>
            </div>
            {tab === "report" && (
              <div
                className="report-panel"
                id="report-panel"
                role="tabpanel"
                aria-labelledby="report-tab"
              >
                {activeCase.status === "ready" ? (
                  <>
                    <div className="report-meta">
                      <span className="badge badge-ready">מבנה לדוגמה</span>
                      <span>טיוטה לעיון הרופא</span>
                    </div>
                    <h3>סיכום הכנה לביקור</h3>
                    <p className="template-note">
                      המבנה הסופי ועיצוב הדו״ח יותאמו לדוגמה שיספק פרופ׳ מאור.
                      הטקסט כאן מדגים את הממשק בלבד.
                    </p>
                    <div className="report-section">
                      <h4>סיבת הפניה</h4>
                      <p>
                        כאן יוצג המידע המתועד במכתב ההפניה, לצד תאריך ומקור.
                      </p>
                      <button
                        className="source-link"
                        onClick={() => {
                          setTab("documents");
                          setSource("referral");
                        }}
                      >
                        מכתב הפניה לדוגמה · עמוד 1 <ArrowLeft size={12} />
                      </button>
                    </div>
                    <div className="report-section">
                      <h4>בדיקות ומסמכים רלוונטיים</h4>
                      <p>
                        ממצאים מהמסמכים יופיעו עם תאריכי הבדיקות והפניה לעמוד
                        המקור. לא מוצגים כאן ממצאים רפואיים אמיתיים.
                      </p>
                      <button
                        className="source-link"
                        onClick={() => {
                          setTab("documents");
                          setSource("echo");
                        }}
                      >
                        דו״ח אקו לדוגמה · עמוד 1 <ArrowLeft size={12} />
                      </button>
                    </div>
                    <div className="report-section">
                      <h4>מידע להשלמה</h4>
                      <p>
                        מסמכים חסרים, טקסט לא קריא ומידע סותר יסומנו לעיון
                        הרופא.
                      </p>
                    </div>
                    <div className="report-footnote">
                      <ShieldCheck size={15} />
                      <span>
                        בגרסה הפעילה כל סיכום יחייב עיון ואימות קליני של הרופא.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="empty-report">
                    <Clock3 size={32} strokeWidth={1.4} />
                    <h3>הסיכום עדיין לא מוכן.</h3>
                    <p>
                      {activeCase.status === "invited"
                        ? "ההזמנה לדוגמה נוצרה, וטרם התקבלו מסמכים."
                        : "בדוגמה זו חסרים מסמכים להשלמת ההכנה."}
                    </p>
                    <span className="badge">סטטוס פיקטיבי להדגמה</span>
                  </div>
                )}
              </div>
            )}
            {tab === "documents" && (
              <div
                className="documents-panel"
                id="documents-panel"
                role="tabpanel"
                aria-labelledby="documents-tab"
              >
                {activeCase.documents === 0 ? (
                  <p className="empty-state">אין מסמכים בביקור לדוגמה הזה.</p>
                ) : (
                  demoDocuments
                    .slice(0, activeCase.documents)
                    .map((document) => (
                      <button
                        className={`document-preview-row ${source === document.id ? "active" : ""}`}
                        key={document.id}
                        onClick={() => setSource(document.id)}
                      >
                        <span className="document-icon">
                          <FileText size={21} />
                        </span>
                        <span>
                          <strong>{document.label}</strong>
                          <small>
                            {document.type} · {document.pages} עמודים פיקטיביים
                          </small>
                        </span>
                        <ArrowLeft size={15} />
                      </button>
                    ))
                )}
                {source && (
                  <div className="source-preview" aria-live="polite">
                    <FileText size={25} />
                    <h3>
                      {
                        demoDocuments.find((document) => document.id === source)
                          ?.label
                      }
                    </h3>
                    <p>
                      כאן יוצג עמוד המקור בגרסה הפעילה.
                      <br />
                      אין מסמך רפואי או קובץ להורדה בהדגמה.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
