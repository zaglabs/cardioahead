"use client";
import { Globe2 } from "lucide-react";
import { useLanguage } from "./language-provider";
export function LanguageSelector() {
  const { language, t, changeLanguage, isSwitching } = useLanguage();
  return (
    <label className="language-selector">
      <Globe2 size={17} aria-hidden="true" />
      <span className="sr-only">{t("בחרו שפה")}</span>
      <select
        aria-label={t("בחרו שפה")}
        value={language}
        disabled={isSwitching}
        aria-busy={isSwitching}
        onChange={(e) => changeLanguage(e.target.value === "en" ? "en" : "he")}
      >
        <option value="he" lang="he">
          עברית
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}
