"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  FolderOpen,
  Heart,
  LockKeyhole,
  RotateCcw,
} from "lucide-react";
import { demoDocuments } from "@/lib/demo-data";

export function PatientDemo() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const stages = ["הביקור שלכם", "המסמכים", "סיום ההכנה"];
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }
  return (
    <div className="patient-layout">
      <aside className="patient-sidebar">
        <span className="eyebrow">מרחב המטופל</span>
        <h1>
          מתכוננים לביקור,
          <br />
          בקצב שלכם.
        </h1>
        <p>
          כמה צעדים פשוטים,
          <br />
          וכל המידע לקראת הפגישה
          <br />
          נמצא במקום אחד.
        </p>
        <ol className="wizard-steps">
          {stages.map((label, index) => (
            <li
              key={label}
              className={
                step === index ? "current" : step > index ? "complete" : ""
              }
            >
              <span>{step > index ? <Check size={15} /> : index + 1}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>
        <div className="sidebar-note">
          <LockKeyhole size={20} />
          <p>בגרסה הפעילה, הגישה תתבצע באמצעות הזמנה אישית ואימות חד־פעמי.</p>
        </div>
      </aside>
      <div className="patient-panel">
        {step === 0 && (
          <>
            <span className="eyebrow">צעד 1 מתוך 3</span>
            <h2>נעים להכיר.</h2>
            <p className="panel-description">
              זו דוגמה למרחב ההכנה שייפתח למטופל לאחר אימות ההזמנה.
            </p>
            <div className="appointment-card">
              <span className="appointment-icon">
                <CalendarDays size={24} />
              </span>
              <div>
                <span>הביקור לדוגמה</span>
                <h3>פגישה עם פרופ׳ אלעד מאור</h3>
                <p>תאריך ושעת הביקור יופיעו כאן</p>
              </div>
            </div>
            <div className="patient-identity">
              <span className="avatar">א</span>
              <div>
                <strong>מטופל/ת לדוגמה</strong>
                <span>פרטי הזיהוי בדוגמה הם פיקטיביים</span>
              </div>
              <span className="badge badge-ready">הדגמה</span>
            </div>
            <div className="info-box">
              <Heart size={19} />
              <p>
                כדאי להכין סיכומי ביקור, תוצאות בדיקות ורשימת תרופות. בהדגמה
                נבחר מסמכים מוכנים מראש.
              </p>
            </div>
            <button className="button button-dark" onClick={() => setStep(1)}>
              ממשיכים למסמכים <ArrowLeft size={17} />
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <span className="eyebrow">צעד 2 מתוך 3</span>
            <h2>המסמכים לקראת הביקור.</h2>
            <p className="panel-description">
              בחרו מסמכים פיקטיביים כדי להתנסות בתהליך. אין אפשרות לבחור או
              להעלות קבצים מהמכשיר.
            </p>
            <div className="demo-upload-area">
              <FolderOpen size={30} strokeWidth={1.4} />
              <strong>כאן יעלו המסמכים בגרסה הפעילה</strong>
              <span>העלאת קבצים אמיתיים עדיין אינה זמינה</span>
            </div>
            <div className="document-options">
              {demoDocuments.map((document) => (
                <button
                  type="button"
                  className={`document-option ${selected.includes(document.id) ? "selected" : ""}`}
                  key={document.id}
                  onClick={() => toggle(document.id)}
                  aria-pressed={selected.includes(document.id)}
                >
                  <span className="document-icon">
                    <FileText size={21} />
                  </span>
                  <span>
                    <strong>{document.label}</strong>
                    <small dir="ltr">{document.file}</small>
                  </span>
                  <span className="option-check">
                    {selected.includes(document.id) && <Check size={14} />}
                  </span>
                </button>
              ))}
            </div>
            <div className="panel-actions">
              <button
                className="button button-dark"
                disabled={selected.length === 0}
                onClick={() => setStep(2)}
              >
                לבדיקת ההכנה <ArrowLeft size={17} />
              </button>
              <button className="text-button" onClick={() => setStep(0)}>
                <ArrowRight size={15} /> חזרה
              </button>
              <span aria-live="polite">{selected.length} מסמכים נבחרו</span>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <span className="eyebrow">צעד 3 מתוך 3</span>
            <h2>ההכנה שלכם מרוכזת.</h2>
            <p className="panel-description">
              כך ייראה שלב בדיקת המסמכים לפני סיום ההכנה.
            </p>
            <div className="review-list">
              {demoDocuments
                .filter((document) => selected.includes(document.id))
                .map((document) => (
                  <div key={document.id}>
                    <FileText size={18} />
                    <strong>{document.label}</strong>
                    <CheckCircle2 size={17} />
                  </div>
                ))}
            </div>
            <div className="info-box">
              <LockKeyhole size={19} />
              <p>
                בגרסה הפעילה יופיעו כאן פרטי השימוש במידע והסכמה מתאימה. בהדגמה
                לא נשמר ולא נשלח מידע.
              </p>
            </div>
            <div className="panel-actions">
              <button className="button button-dark" onClick={() => setStep(3)}>
                סיום ההדגמה <Check size={17} />
              </button>
              <button className="text-button" onClick={() => setStep(1)}>
                <ArrowRight size={15} /> עריכת הבחירה
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <div className="completion">
            <span className="completion-icon">
              <Check size={32} />
            </span>
            <span className="eyebrow">סיימתם את ההדגמה</span>
            <h2>מוכנים לפגישה טובה יותר.</h2>
            <p>
              בגרסה הפעילה צוות המרפאה יראה שהמסמכים הוגשו.
              <br />
              בהדגמה הזו לא הועלו קבצים ולא נשלחו הודעות.
            </p>
            <Link className="button button-dark" href="/demo/clinic">
              לסביבת המרפאה <ArrowLeft size={17} />
            </Link>
            <button
              className="text-button"
              onClick={() => {
                setStep(0);
                setSelected([]);
              }}
            >
              <RotateCcw size={15} /> התחילו מחדש
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
