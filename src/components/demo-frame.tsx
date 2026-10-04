import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { Brand } from "./brand";
export function DemoFrame({
  active,
  children,
}: {
  active: "patient" | "clinic";
  children: React.ReactNode;
}) {
  return (
    <div className="demo-root">
      <div className="demo-banner">
        <FlaskConical size={15} />
        <span>
          סביבת הדגמה · נתונים פיקטיביים בלבד · אין העלאה או שליחה של מידע
        </span>
      </div>
      <header className="demo-header wrap">
        <Brand />
        <nav aria-label="בחירת הדגמה">
          <Link
            className={active === "patient" ? "active" : ""}
            href="/demo/patient"
            aria-current={active === "patient" ? "page" : undefined}
          >
            מרחב המטופל
          </Link>
          <Link
            className={active === "clinic" ? "active" : ""}
            href="/demo/clinic"
            aria-current={active === "clinic" ? "page" : undefined}
          >
            סביבת המרפאה
          </Link>
        </nav>
        <Link className="demo-back" href="/">
          <ArrowRight size={15} /> חזרה לאתר
        </Link>
      </header>
      <main id="main" className="demo-main wrap">
        {children}
      </main>
      <footer className="demo-footer">
        CardioAhead · הכנה לביקור אצל פרופ׳ אלעד מאור · הדגמת ממשק
      </footer>
    </div>
  );
}
