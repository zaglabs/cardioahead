"use client";
import { useLanguage } from "@/components/language-provider";
import Link from "next/link";
export function Brand({ light = false }: { light?: boolean }) {
  const { t } = useLanguage();

  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label={t("CardioAhead — עמוד הבית")}
    >
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="13" fill="currentColor" />
        <path
          d="M8 21h7l3-9 5 17 3-8h6"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span dir="ltr">
        cardio<span className="brand-ahead">ahead</span>
        <span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
