import { getTranslations } from "@/lib/i18n/server";
import Link from "next/link";
import { FileText, ArrowDownToLine } from "lucide-react";
import { SiteHeader, Footer } from "@/components/shell";
import fixtures from "@/lib/test-documents.json";
export default async function TestDocumentsPage() {
  const { t } = await getTranslations();

  return (
    <>
      <SiteHeader />
      <main id="main" className="prose-page wrap">
        <span className="eyebrow">{t("חבילת בדיקה בעברית")}</span>
        <h1>{t("מסמכי בדיקה פיקטיביים.")}</h1>
        <p className="prose-lead">
          {t(
            "שלושה מסמכים של אותו מטופל בדיקה, לצורך התנסות בהעלאה ובצפייה מצד המרפאה.",
          )}
        </p>
        <p>
          {t(
            "המסמכים מתארים תרחיש מומצא של מחלת לב כלילית ותפקוד לב מופחת. אין בהם נתונים של אדם אמיתי, ואין להשתמש בהם כמידע רפואי.",
          )}
        </p>
        <div className="test-document-list">
          {fixtures.map((f) => (
            <a
              className="document-preview-row"
              key={f.filename}
              href={"/test-documents/" + f.filename}
              download
            >
              <FileText size={24} />
              <div>
                <strong>{t(f.label)}</strong>
                <small>{t("PDF בעברית · מטופל בדיקה 001")}</small>
              </div>
              <ArrowDownToLine size={20} />
            </a>
          ))}
        </div>
        <h2>{t("איך בודקים את התהליך?")}</h2>
        <ol>
          <li>{t("נכנסים לסביבת המרפאה ויוצרים הזמנה למטופל בדיקה.")}</li>
          <li>{t("פותחים את הקישור בדפדפן אחר ומזינים את קוד הגישה.")}</li>
          <li>{t("מצרפים שניים או שלושה מסמכים מהרשימה ושולחים למרפאה.")}</li>
          <li>{t("חוזרים לתיק הביקור במרפאה ופותחים את הקבצים שהתקבלו.")}</li>
        </ol>
        <Link className="button button-dark" href="/admin">
          {t("לסביבת המרפאה")}
        </Link>
      </main>
      <Footer />
    </>
  );
}
