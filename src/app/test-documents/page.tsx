import Link from "next/link";
import { FileText, ArrowDownToLine } from "lucide-react";
import { SiteHeader, Footer } from "@/components/shell";
import fixtures from "@/lib/test-documents.json";
export default function TestDocumentsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="prose-page wrap">
        <span className="eyebrow">חבילת בדיקה בעברית</span>
        <h1>מסמכי בדיקה פיקטיביים.</h1>
        <p className="prose-lead">
          שלושה מסמכים של אותו מטופל בדיקה, לצורך התנסות בהעלאה ובצפייה מצד
          המרפאה.
        </p>
        <p>
          המסמכים מתארים תרחיש מומצא של מחלת לב כלילית ותפקוד לב מופחת. אין בהם
          נתונים של אדם אמיתי, ואין להשתמש בהם כמידע רפואי.
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
                <strong>{f.label}</strong>
                <small>PDF בעברית · מטופל בדיקה 001</small>
              </div>
              <ArrowDownToLine size={20} />
            </a>
          ))}
        </div>
        <h2>איך בודקים את התהליך?</h2>
        <ol>
          <li>נכנסים לסביבת המרפאה ויוצרים הזמנה למטופל בדיקה.</li>
          <li>פותחים את הקישור בדפדפן אחר ומזינים את קוד הגישה.</li>
          <li>מצרפים שניים או שלושה מסמכים מהרשימה ושולחים למרפאה.</li>
          <li>חוזרים לתיק הביקור במרפאה ופותחים את הקבצים שהתקבלו.</li>
        </ol>
        <Link className="button button-dark" href="/admin">
          לסביבת המרפאה
        </Link>
      </main>
      <Footer />
    </>
  );
}
