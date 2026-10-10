"use client";
import Link from "next/link";
import { LayoutDashboard, Link2 } from "lucide-react";
import { useLanguage } from "./language-provider";
import type { Staff } from "@/lib/portal/types";
export function ClinicSidebar({
  staff,
  active,
}: {
  staff: Staff;
  active: "clinic" | "invitations";
}) {
  const { t, language } = useLanguage(),
    w = (he: string, en: string) => (language === "he" ? he : en);
  const links = (
    <>
      <Link
        className={
          active === "clinic" ? "sidebar-selected" : "sidebar-navigation-link"
        }
        href={"/admin?lang=" + language}
        aria-current={active === "clinic" ? "page" : undefined}
      >
        <LayoutDashboard size={19} />
        {t("הכנה לביקורים")}
      </Link>
      <Link
        className={
          active === "invitations"
            ? "sidebar-selected"
            : "sidebar-navigation-link"
        }
        href={"/admin/invitations?lang=" + language}
        aria-current={active === "invitations" ? "page" : undefined}
      >
        <Link2 size={19} />
        {w("קישורי הזמנה", "Invitation Links")}
      </Link>
    </>
  );
  return (
    <>
      <aside className="clinic-sidebar">
        <span className="eyebrow">{t("פרופ׳ אלעד מאור")}</span>
        <h2>{t("סביבת המרפאה")}</h2>
        <nav aria-label={w("ניווט המרפאה", "Clinic navigation")}>{links}</nav>
        <div className="clinic-sidebar-bottom">
          <span className="avatar">{t("מ")}</span>
          <div>
            <strong>{t("צוות המרפאה")}</strong>
            <small dir="ltr">{staff.email}</small>
          </div>
        </div>
      </aside>
      <nav
        className="clinic-mobile-navigation"
        aria-label={w("ניווט המרפאה במכשיר נייד", "Mobile clinic navigation")}
      >
        {links}
      </nav>
    </>
  );
}
