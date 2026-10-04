import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import { Brand } from "./brand";
export function SiteHeader() {
  return (
    <header className="site-header wrap">
      <Brand />
      <nav aria-label="ניווט ראשי">
        <Link href="/#how-it-works">איך זה עובד</Link>
        <Link href="/#questions">שאלות נפוצות</Link>
        <Link className="nav-clinic" href="/admin">
          כניסה לצוות המרפאה
          <ArrowUpLeft size={15} />
        </Link>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer wrap">
      <Brand />
      <p>הכנה לביקור אצל פרופ׳ אלעד מאור</p>
      <div>
        <Link href="/privacy">פרטיות</Link>
        <a href="https://eladmaor.co.il/" target="_blank" rel="noreferrer">
          אתר פרופ׳ מאור
        </a>
        <span dir="ltr">© {new Date().getFullYear()} CardioAhead</span>
      </div>
    </footer>
  );
}
