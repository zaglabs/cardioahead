"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_COOKIE, translate, type Language } from "@/lib/i18n/catalog";
type LanguageContextValue = {
  language: Language;
  locale: string;
  t: (value: string) => string;
  changeLanguage: (language: Language) => void;
  isSwitching: boolean;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);
export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // The explicit client choice stays authoritative while server responses arrive.
  // Keeping this provider mounted also preserves every form and upload step.
  const [language, setLanguage] = useState(initialLanguage);
  const [isSwitching, startTransition] = useTransition();
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "he" ? "rtl" : "ltr";
  }, [language]);
  const changeLanguage = useCallback(
    (next: Language) => {
      setLanguage(next);
      document.cookie =
        LANGUAGE_COOKIE +
        "=" +
        next +
        "; Path=/; Max-Age=31536000; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      startTransition(() => {
        // Update the URL immediately so a reload cannot revert the language.
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
        router.refresh();
      });
    },
    [router],
  );
  const t = useCallback(
    (value: string) => translate(value, language),
    [language],
  );
  const value = useMemo(
    () => ({
      language,
      locale: language === "en" ? "en-US" : "he-IL",
      t,
      changeLanguage,
      isSwitching,
    }),
    [language, t, changeLanguage, isSwitching],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LANGUAGE_PROVIDER_REQUIRED");
  return context;
}
