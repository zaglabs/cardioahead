import { getTranslations } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { SiteHeader, Footer } from "@/components/shell";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return { title: t("פרטיות ושימוש במידע") };
}
export default async function PrivacyPage() {
  const { t, language } = await getTranslations();
  const w = (he: string, en: string) => (language === "he" ? he : en);

  return (
    <>
      <SiteHeader />
      <main id="main" className="prose-page wrap">
        <span className="eyebrow">{t("פרטיות ושקיפות")}</span>
        <h1>{t("פרטיות ושימוש במידע.")}</h1>
        <p className="prose-lead">
          {w(
            "CardioAhead נמצא בשלב הרצה. העלאת PDF ידנית מוגבלת למסמכי הבדיקה; ייבוא מכללית זמין בהרצה מודרכת במחשב ובהסכמה מפורשת.",
            "CardioAhead is a pilot. Manual PDF uploads accept the reviewed test documents; Clalit import is available through a guided desktop pilot with explicit consent.",
          )}
        </p>
        <h2>{t("המידע שנאסף בתהליך")}</h2>
        <p>
          {t(
            "צוות המרפאה יוצר כינוי מטופל ומועד ביקור. העלאת PDF ידנית נשארת מוגבלת למסמכי הבדיקה הפיקטיביים. בעת העלאה נשמרים הקובץ, שמו, גודלו וזמן ההעלאה. ייבוא אישי מכללית נעשה בנפרד, בהסכמה מפורשת, כמתואר בהמשך.",
          )}
        </p>
        <h2>
          {w("ייבוא מכללית בהסכמת המטופל", "Patient-consented Clalit import")}
        </h2>
        <p>
          {w(
            "אחרי אימות הקישור והקוד, המטופל מאשר שהחשבון שייך לו ואת העברת המידע שנאסף ל־Claude של Anthropic להכנת סיכום. האספן המקומי פותח דפדפן פרטי והמטופל מתחבר לכללית בעצמו. סיסמאות וקודי התחברות לכללית אינם נאספים או נשלחים ל־CardioAhead. האיסוף מוגבל למבנים הנתמכים ומדווח על פערים.",
            "After verifying the invitation link and code, the patient confirms self-account scope and explicitly approves sending collected information to Anthropic’s Claude to prepare a summary. The local collector opens a private browser and the patient signs into Clalit themselves. Clalit passwords and login codes are not collected or sent to CardioAhead. Collection is limited to supported layouts and reports its gaps.",
          )}
        </p>
        <p>
          {w(
            "המידע המלא שנאסף מוחזק זמנית בזיכרון האספן והעיבוד. לא מצורפים מסמכים מקוריים מכללית. בתיק המרפאה נשמרים הסיכום, פרטי מקור וקטעי ראיה קצרים. המידע הזמני באספן נמחק לאחר העברה שאושרה, בסגירה או בתפוגה. הדפדפן, מערכת ההפעלה וספקי השירות מפעילים את מנגנוני התפעול הרגילים שלהם; אין כאן הבטחה לאפס שמירה בכל מערכת.",
            "Full collected text is held temporarily in collector and processing memory. Original Clalit documents are not attached. The clinic record retains the summary, provenance and short evidence excerpts. Collector buffers are cleared after an accepted transfer, at shutdown or expiry. Browsers, operating systems and service providers have their normal handling; this is not a guarantee of zero retention in every system.",
          )}
        </p>
        <h2>{w("מעקב אחר הזמנות", "Invitation activity tracking")}</h2>
        <p>
          {w(
            "צפייה בקישור וכניסה מאומתת נרשמות בנפרד. נספרות העלאות שנשמרו בפועל, ורשומות מכללית נחשבות כמתקבלות רק לאחר אימות מבנה המידע וההרשאה. הצלחת ייבוא נרשמת כשהסיכום נשמר. קישורים וקודים חדשים מוצפנים ונחשפים רק לצוות מורשה; בקישורים ישנים שאין להם עותק מוצפן נדרש קישור חלופי. שליחה מחדש כוללת קישור וקוד ללא ממצאים רפואיים.",
            "Link views and verified access are tracked separately. Only saved uploads are counted; Clalit records are recorded as received after validating data structure and authorization. Successful import is recorded when the summary is saved. New links and codes are encrypted and revealed only to authorized staff; older links without an encrypted copy require replacement. Resend emails contain the invitation link and code without medical findings.",
          )}
        </p>
        <h2>{t("גישה למסמכים")}</h2>
        <p>
          {t(
            "ההעלאה מתאפשרת דרך קישור אישי וקוד גישה מוגבלים בזמן. צוות המרפאה נכנס עם חשבון אישי מורשה. כשהאחסון מחובר, הקבצים נשמרים באחסון פרטי ואינם זמינים דרך קישור ציבורי. פעולות כניסה, העלאה, שליחה וצפייה נרשמות לצורך מעקב תפעולי.",
          )}
        </p>
        <h2>{t("עוגיות ותפעול")}</h2>
        <p>
          {t(
            "המערכת משתמשת בעוגיות הכרחיות לצורך שמירת כניסה, לזמן מוגבל. אין באתר כלי ניתוח התנהגות או פרסום. ספק האירוח Vercel וספק האחסון Supabase עשויים לעבד מידע טכני הדרוש לתפעול השירות, כגון כתובת IP ופרטי בקשה.",
          )}
        </p>
        <p>
          {t(
            "נשמרת גם בחירת השפה שלכם בעוגייה, כדי שהממשק יוצג בשפה שבחרתם בביקורים הבאים.",
          )}
        </p>
        <h2>{t("כניסה לצוות המרפאה")}</h2>
        <p>
          {t(
            "לצורך הכניסה נשמרים כתובת הדוא״ל, מצב האישור והרשאת החשבון. קוד כניסה נשלח באמצעות Resend. ההודעה כוללת את הקוד בלבד ואינה כוללת מידע רפואי. נשמרת חתימה חד־כיוונית של הקוד, שתוקפו 10 דקות ולשימוש אחד. בקשות גישה חדשות ממתינות לאישור מנהל המערכת לפני שניתן לצפות במסמכים.",
          )}
        </p>
        <h2>{t("סיכום באמצעות AI")}</h2>
        <p>
          {t(
            "קובצי PDF פיקטיביים שאושרו נשלחים לשירות AI שנבחר ואושר, Claude או OpenAI. מידע שנאסף מכללית נשלח ל־Claude בלבד, בהסכמה מפורשת של המטופל. נשמרת טיוטת סיכום עם הפניות ומידע חסר לבדיקה. ההסבר החזותי נוצר רק לאחר בקשה מפורשת של הרופא. הסיכום וההמחשה דורשים בדיקת רופא ואינם מהווים אבחנה או תכנית טיפול עצמאית.",
          )}
        </p>
        <h2>{t("מסירת סיכום ביקור מאושר")}</h2>
        <p>
          {t(
            "סיכומי ביקור והמלצות נשמרים כטיוטות לעריכת הרופא. רק גרסה שהרופא או המנהל עיין בה ואישר במפורש ניתנת למסירה. הודעת Resend כוללת קישור מאובטח ללא ממצאים רפואיים; הצפייה דורשת קוד אימות לדוא״ל הנמען שאושר. הקישור תקף לשבעה ימים וניתן לביטול. נשמרים הגרסה שאושרה, קובץ PDF מדויק, זהות המאשר וניסיונות המסירה. עריכה מחייבת אישור חדש.",
          )}
        </p>
        <h2>{t("שמירה ומחיקה בשלב הבדיקות")}</h2>
        <p>
          {t(
            "מסמכי הבדיקה נשמרים עד שצוות המערכת מוחק את תיקי הבדיקה. ביטול הזמנה מונע כניסה דרך הקישור ואינו מוחק מסמכים שכבר התקבלו. לפני תחילת שימוש עם מטופלים אמיתיים יפורסמו פרטי הגורם האחראי, תקופת שמירה, אפשרויות מחיקה ומענה לפניות.",
          )}
        </p>
        <h2>{t("פנייה למרפאה")}</h2>
        <p>
          {t("פרטי הקשר מופיעים")}{" "}
          <a href="https://eladmaor.co.il/" target="_blank" rel="noreferrer">
            {t("באתר פרופ׳ אלעד מאור")}
          </a>
          {t(
            ". שליחת מסמכים אינה פנייה רפואית דחופה ואינה מחליפה את הביקור אצל הרופא.",
          )}
        </p>
      </main>
      <Footer />
    </>
  );
}
