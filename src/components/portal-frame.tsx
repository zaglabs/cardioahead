import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Brand } from "./brand";
export function PortalFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-root">
      <header className="demo-header wrap">
        <Brand />
        <span className="portal-context">
          <LockKeyhole size={16} /> הכנה לביקור במרפאה
        </span>
        <Link className="demo-back" href="/">
          <ArrowRight size={15} /> חזרה לאתר
        </Link>
      </header>
      <main id="main" className="demo-main wrap">
        {children}
      </main>
      <footer className="demo-footer">
        CardioAhead · המרפאה של פרופ׳ אלעד מאור
      </footer>
    </div>
  );
}
