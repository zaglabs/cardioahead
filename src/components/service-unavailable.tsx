import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { SiteHeader, Footer } from "./shell";
export function ServiceUnavailable({ clinic = false }: { clinic?: boolean }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="unavailable wrap">
        <div className="unavailable-card">
          <span className="completion-icon">
            <LockKeyhole size={30} />
          </span>
          <span className="eyebrow">
            {clinic ? "גישה לצוות המרפאה" : "הזמנה אישית לביקור"}
          </span>
          <h1>
            {clinic
              ? "סביבת הצוות עדיין בהקמה."
              : "הגישה האישית עדיין אינה זמינה."}
          </h1>
          <p>
            {clinic
              ? "הכניסה לצוות תיפתח לאחר השלמת האימות והרשאות הגישה."
              : "המערכת עדיין אינה מאמתת הזמנות ואינה מקבלת מסמכים. לבירור פרטי הביקור, פנו לצוות המרפאה."}
          </p>
          <Link
            className="button button-dark"
            href={clinic ? "/demo/clinic" : "/demo/patient"}
          >
            לצפייה בהדגמת הממשק <ArrowLeft size={17} />
          </Link>
          <a
            className="text-link"
            href="https://eladmaor.co.il/"
            target="_blank"
            rel="noreferrer"
          >
            לאתר המרפאה
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
