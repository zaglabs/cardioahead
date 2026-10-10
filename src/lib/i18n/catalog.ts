import clinical from "./clinical.en.json";
import evidence from "./evidence.en.json";
import common from "./common.en.json";
import publicPages from "./public.en.json";
import patient from "./patient.en.json";
import clinic from "./clinic.en.json";
export type Language = "he" | "en";
export const LANGUAGE_COOKIE = "cardioahead_language";
export const english: Record<string, string> = {
  ...common,
  ...publicPages,
  ...patient,
  ...clinic,
  ...clinical,
  ...evidence,
};
const hebrew = Object.fromEntries(
  Object.entries(english).map(([he, en]) => [en, he]),
);
export function translate(value: string, language: Language) {
  const key = value.replace(/\s+/g, " ").trim();
  const translated = language === "en" ? english[key] : hebrew[key];
  if (translated === undefined) return value;
  const before = /^\s/.test(value) ? " " : "";
  const after = /\s$/.test(value) ? " " : "";
  return before + translated + after;
}
