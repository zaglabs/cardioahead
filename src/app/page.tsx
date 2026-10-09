import { getTranslations } from "@/lib/i18n/server";
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
export default async function Home() {
  const { t } = await getTranslations();

  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="small-dot" />
              {t("לקראת הביקור אצל פרופ׳ אלעד מאור")}
            </span>
            <h1>
              {t("הטיפול מתחיל")}
              <br />
              {t("עוד")}{" "}
              <span className="serif-accent">{t("לפני הפגישה.")}</span>
            </h1>
            <p className="hero-description">
              {t("כל המידע הרפואי שלכם, במקום אחד.")}
              <br />
              {t("מרחב הכנה לביקור, שנועד לעזור לכם ולרופא")}
              <br className="desktop-break" />
              {t("להגיע לפגישה עם תמונה ברורה יותר.")}
            </p>
            <div className="hero-actions">
              <Link className="button button-dark" href="#how-it-works">
                {t("איך מכינים את הביקור")}
                <ArrowLeft size={18} />
              </Link>
              <a className="text-link" href="#how-it-works">
                {t("איך זה עובד")}
                <ArrowUpLeft size={16} />
              </a>
            </div>
            <div className="invitation-note">
              <LockKeyhole size={16} />
              <span>
                {t("קיבלתם קישור מהמרפאה? הכניסה תתבצע דרך הקישור האישי.")}
              </span>
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
                <strong>{t("המידע לפני הביקור")}</strong>
                <span>{t("מסמכים · בדיקות · סיכומים")}</span>
              </div>
              <span className="mini-check">
                <Check size={13} />
              </span>
            </div>
            <div className="art-card art-card-two">
              <CalendarDays size={17} />
              <span>{t("יותר מקום לשיחה בפגישה")}</span>
            </div>
            <span className="art-caption">
              {t("איור סכמטי · אינו מייצג מטופל")}
            </span>
          </div>
        </section>
        <section className="principles">
          <div className="wrap principles-inner">
            <span>
              <ShieldCheck size={19} />
              {t("גישה אישית למטופל")}
            </span>
            <span>
              <FileText size={19} />
              {t("המידע מרוכז לקראת הביקור")}
            </span>
            <span>
              <Heart size={19} />
              {t("הרופא במרכז קבלת ההחלטות")}
            </span>
          </div>
        </section>
        <section className="steps-section wrap" id="how-it-works">
          <div className="section-intro">
            <div>
              <span className="eyebrow">{t("פשוט, צעד אחר צעד")}</span>
              <h2>
                {t("פחות התעסקות.")}
                <br />
                <span className="muted-text">{t("יותר מוכנות.")}</span>
              </h2>
            </div>
            <p>
              {t("לא צריך לפתוח חשבון חדש.")}
              <br />
              {t("התהליך מתחיל בהזמנה אישית מהמרפאה.")}
            </p>
          </div>
          <div className="steps-grid">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <article className="step-card" key={number}>
                <div className="step-top">
                  <Icon size={26} strokeWidth={1.4} />
                  <span dir="ltr">{number}</span>
                </div>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
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
            <span className="eyebrow">{t("המרפאה של פרופ׳ אלעד מאור")}</span>
            <h2>
              {t("ההכנה הדיגיטלית.")}
              <br />
              {t("הקשר נשאר אישי.")}
            </h2>
            <p>
              {t("CardioAhead נבנה כדי לתמוך בהכנה לפגישה עם פרופ׳ מאור.")}
              <br />
              {t(
                "המסמכים זמינים לעיון צוות המרפאה, וההחלטות הרפואיות מתקבלות על ידי הרופא.",
              )}
            </p>
            <a
              className="text-link"
              href="https://eladmaor.co.il/"
              target="_blank"
              rel="noreferrer"
            >
              {t("לאתר של פרופ׳ מאור")}
              <ArrowUpLeft size={16} />
            </a>
          </div>
          <div className="doctor-note">
            <span className="small-dot" />
            <strong>{t("מקום אחד להכנה")}</strong>
            <p>
              {t("לפני הביקור, בזמן שלכם.")}
              <br />
              {t("כדי שהפגישה תתחיל")}
              <br />
              {t("עם המידע הרלוונטי.")}
            </p>
          </div>
        </section>
        <section className="faq-section wrap" id="questions">
          <div>
            <span className="eyebrow">{t("טוב לדעת")}</span>
            <h2>{t("לפני שמתחילים.")}</h2>
            <p>{t("כמה תשובות לשאלות שעולות בדרך.")}</p>
          </div>
          <div className="faq-list">
            <details>
              <summary>{t("איך מעלים את המסמכים?")}</summary>
              <p>
                {t(
                  "העלאת המסמכים מתבצעת דרך קישור אישי וקוד גישה שמקבלים מהמרפאה. בשלב הבדיקות אפשר להעלות רק את המסמכים הפיקטיביים של CardioAhead.",
                )}
              </p>
            </details>
            <details>
              <summary>{t("אילו מסמכים כדאי להכין?")}</summary>
              <p>
                {t(
                  "סיכומי ביקור קודמים, הפניה, תוצאות בדיקות ורשימת תרופות. צוות המרפאה יגדיר את הרשימה בהתאם לביקור.",
                )}
              </p>
            </details>
            <details>
              <summary>{t("איך נכנסים למרחב האישי?")}</summary>
              <p>
                {t(
                  "צוות המרפאה ימסור לכם קישור אישי וקוד גישה. פותחים את הקישור ומזינים את הקוד כדי להיכנס לתיק הביקור.",
                )}
              </p>
            </details>
            <details>
              <summary>{t("האם הסיכום מחליף את הפגישה עם הרופא?")}</summary>
              <p>
                {t(
                  "המסמכים נועדו להכין את המידע לעיון הרופא. טיוטת סיכום עם הפניות למקורות מוכנה לצוות המרפאה, ואינה מחליפה ייעוץ או בדיקה רפואית.",
                )}
              </p>
            </details>
          </div>
        </section>
        <section className="bottom-cta wrap">
          <div>
            <span className="eyebrow">{t("לקראת הפגישה")}</span>
            <h2>{t("קיבלתם קישור מהמרפאה?")}</h2>
            <p>
              {t(
                "פתחו את הקישור האישי שקיבלתם, והכינו את המסמכים בזמן שנוח לכם.",
              )}
            </p>
          </div>
          <div>
            <Link className="button button-dark" href="#how-it-works">
              {t("איך מכינים את הביקור")}
              <ArrowLeft size={18} />
            </Link>
            <Link className="text-link" href="/admin">
              {t("כניסה לצוות המרפאה")}
              <ArrowUpLeft size={16} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
