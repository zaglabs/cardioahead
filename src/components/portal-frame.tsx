"use client";
import { useLanguage } from "@/components/language-provider";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Brand } from "./brand";
import { LanguageSelector } from "./language-selector";
export function PortalFrame({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();

  return (
    <div className="demo-root">
      <header className="demo-header wrap">
        <Brand />
        <span className="portal-context">
          <LockKeyhole size={16} />
          {t("הכנה לביקור במרפאה")}
        </span>
        <div className="portal-header-actions">
          <LanguageSelector />
          <Link className="demo-back" href="/">
            <ArrowRight size={15} />
            {t("חזרה לאתר")}
          </Link>
        </div>
      </header>
      <main id="main" className="demo-main wrap">
        {children}
      </main>
      <footer className="demo-footer">
        {t("CardioAhead · המרפאה של פרופ׳ אלעד מאור")}
      </footer>
    </div>
  );
}
