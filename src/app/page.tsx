import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpLeft,
  CalendarDays,
  Check,
  FileText,
  Heart,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader, Footer } from "@/components/shell";
import { HeartIllustration } from "@/components/heart-illustration";

const steps = [
  {
    number: "01",
    icon: MessageCircle,
    title: "מקבלים קישור אישי",
    text: "צוות המרפאה ישלח לכם הזמנה לקראת הביקור.",
  },
  {
    number: "02",
    icon: FileText,
    title: "מרכזים את המסמכים",
    text: "מכינים את סיכומי הביקור, תוצאות הבדיקות ורשימת התרופות.",
  },
  {
    number: "03",
    icon: Heart,
    title: "מגיעים מוכנים יותר",
    text: "המידע מרוכז לקראת הפגישה, כדי לפנות מקום לשיחה עם הרופא.",
  },
];
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="small-dot" /> לקראת הביקור אצל פרופ׳ אלעד מאור
            </span>
            <h1>
              הטיפול מתחיל
              <br />
              עוד <span className="serif-accent">לפני הפגישה.</span>
            </h1>
            <p className="hero-description">
              כל המידע הרפואי שלכם, במקום אחד.
              <br />
              מרחב הכנה לביקור, שנועד לעזור לכם ולרופא
              <br className="desktop-break" /> להגיע לפגישה עם תמונה ברורה יותר.
            </p>
            <div className="hero-actions">
              <Link className="button button-dark" href="/demo/patient">
                ראו איך מכינים את הביקור <ArrowLeft size={18} />
              </Link>
              <a className="text-link" href="#how-it-works">
                איך זה עובד <ArrowUpLeft size={16} />
              </a>
            </div>
            <div className="invitation-note">
              <LockKeyhole size={16} />
              <span>קיבלתם קישור מהמרפאה? הכניסה תתבצע דרך הקישור האישי.</span>
            </div>
          </div>
          <div className="hero-art">
            <span className="art-kicker" dir="ltr">
              A clearer picture. A better conversation.
            </span>
            <HeartIllustration />
            <div className="art-card art-card-one">
              <span className="art-icon">
                <FileText size={18} />
              </span>
              <div>
                <strong>המידע לפני הביקור</strong>
                <span>מסמכים · בדיקות · סיכומים</span>
              </div>
              <span className="mini-check">
                <Check size={13} />
              </span>
            </div>
            <div className="art-card art-card-two">
              <CalendarDays size={17} />
              <span>יותר מקום לשיחה בפגישה</span>
            </div>
            <span className="art-caption">איור סכמטי · אינו מייצג מטופל</span>
          </div>
        </section>
        <section className="principles">
          <div className="wrap principles-inner">
            <span>
              <ShieldCheck size={19} /> גישה אישית למטופל
            </span>
            <span>
              <FileText size={19} /> המידע מרוכז לקראת הביקור
            </span>
            <span>
              <Heart size={19} /> הרופא במרכז קבלת ההחלטות
            </span>
          </div>
        </section>
        <section className="steps-section wrap" id="how-it-works">
          <div className="section-intro">
            <div>
              <span className="eyebrow">פשוט, צעד אחר צעד</span>
              <h2>
                פחות התעסקות.
                <br />
                <span className="muted-text">יותר מוכנות.</span>
              </h2>
            </div>
            <p>
              לא צריך לפתוח חשבון חדש.
              <br />
              התהליך המתוכנן מתחיל בהזמנה אישית מהמרפאה.
            </p>
          </div>
          <div className="steps-grid">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <article className="step-card" key={number}>
                <div className="step-top">
                  <Icon size={26} strokeWidth={1.4} />
                  <span dir="ltr">{number}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="doctor-section wrap">
          <div className="doctor-monogram" aria-hidden="true">
            <span>EM</span>
            <Heart size={28} strokeWidth={1} />
          </div>
          <div>
            <span className="eyebrow">המרפאה של פרופ׳ אלעד מאור</span>
            <h2>
              ההכנה הדיגיטלית.
              <br />
              הקשר נשאר אישי.
            </h2>
            <p>
              CardioAhead נבנה כדי לתמוך בהכנה לפגישה עם פרופ׳ מאור.
              <br />
              סיכום המסמכים מיועד לעיון הרופא, וההחלטות הרפואיות מתקבלות על ידו.
            </p>
            <a
              className="text-link"
              href="https://eladmaor.co.il/"
              target="_blank"
              rel="noreferrer"
            >
              לאתר של פרופ׳ מאור <ArrowUpLeft size={16} />
            </a>
          </div>
          <div className="doctor-note">
            <span className="small-dot" />
            <strong>מקום אחד להכנה</strong>
            <p>
              לפני הביקור, בזמן שלכם.
              <br />
              כדי שהפגישה תתחיל
              <br />
              עם המידע הרלוונטי.
            </p>
          </div>
        </section>
        <section className="faq-section wrap" id="questions">
          <div>
            <span className="eyebrow">טוב לדעת</span>
            <h2>לפני שמתחילים.</h2>
            <p>כמה תשובות לשאלות שעולות בדרך.</p>
          </div>
          <div className="faq-list">
            <details>
              <summary>האם אפשר כבר להעלות מסמכים?</summary>
              <p>
                עדיין לא. זו גרסת הדגמה של הממשק. העלאת מסמכים תיפתח לאחר השלמת
                מערכת האחסון והגישה למטופלים.
              </p>
            </details>
            <details>
              <summary>אילו מסמכים כדאי להכין?</summary>
              <p>
                סיכומי ביקור קודמים, הפניה, תוצאות בדיקות ורשימת תרופות. צוות
                המרפאה יגדיר את הרשימה בהתאם לביקור.
              </p>
            </details>
            <details>
              <summary>איך נכנסים למרחב האישי?</summary>
              <p>
                בגרסה הפעילה תקבלו קישור אישי מהמרפאה ותאמתו את הכניסה באמצעות
                קוד חד־פעמי.
              </p>
            </details>
            <details>
              <summary>האם הסיכום מחליף את הפגישה עם הרופא?</summary>
              <p>
                הסיכום נועד להכין את המידע לעיון הרופא. הוא אינו אבחנה ואינו
                מחליף ייעוץ או בדיקה רפואית.
              </p>
            </details>
          </div>
        </section>
        <section className="bottom-cta wrap">
          <div>
            <span className="eyebrow">מבט ראשון על המערכת</span>
            <h2>בואו לראות את התהליך.</h2>
            <p>הדגמה עם מידע פיקטיבי בלבד, למטופל ולצוות המרפאה.</p>
          </div>
          <div>
            <Link className="button button-dark" href="/demo/patient">
              הדגמת הכנה לביקור <ArrowLeft size={18} />
            </Link>
            <Link className="text-link" href="/demo/clinic">
              הדגמת סביבת המרפאה <ArrowUpLeft size={16} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
