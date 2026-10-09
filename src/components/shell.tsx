"use client";
import { useLanguage } from "@/components/language-provider";
import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import { Brand } from "./brand";
import { LanguageSelector } from "./language-selector";
export function SiteHeader() {
  const { t } = useLanguage();

  return (
    <header className="site-header wrap">
      <Brand />
      <div className="header-controls">
        <nav aria-label={t("ניווט ראשי")}>
          <Link href="/#how-it-works">{t("איך זה עובד")}</Link>
          <Link href="/#questions">{t("שאלות נפוצות")}</Link>
          <Link className="nav-clinic" href="/admin">
            {t("כניסה לצוות המרפאה")}
            <ArrowUpLeft size={15} />
          </Link>
        </nav>
        <LanguageSelector />
      </div>
    </header>
  );
}
export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="site-footer wrap">
      <Brand />
      <p>{t("הכנה לביקור אצל פרופ׳ אלעד מאור")}</p>
      <div>
        <Link href="/privacy">{t("פרטיות")}</Link>
        <a href="https://eladmaor.co.il/" target="_blank" rel="noreferrer">
          {t("אתר פרופ׳ מאור")}
        </a>
        <span dir="ltr">© {new Date().getFullYear()} CardioAhead</span>
      </div>
    </footer>
  );
}
