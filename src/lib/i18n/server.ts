import "server-only";
import { headers, cookies } from "next/headers";
import { LANGUAGE_COOKIE, type Language, translate } from "./catalog";
export async function getLanguage(): Promise<Language> {
  const requested = (await headers()).get("x-cardioahead-language");
  if (requested === "en" || requested === "he") return requested;
  return (await cookies()).get(LANGUAGE_COOKIE)?.value === "en" ? "en" : "he";
}
export async function getTranslations() {
  const language = await getLanguage();
  return {
    language,
    locale: language === "en" ? "en-US" : "he-IL",
    t: (value: string) => translate(value, language),
  };
}
