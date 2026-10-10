import type { MedicalSlide, MedicalBundle, MedicalFact } from "./schema.mjs";
import type { FocusArea } from "@/lib/clinical/presentation-focus";
export type MedicalFocus = {
  area: FocusArea;
  mode: "comparison" | "location";
  fact: MedicalFact;
  historical: boolean;
};
const denied =
  /\b(no|not|without|unknown|uncertain|suspected|possible|unconfirmed|excluded|rule out)\b|אין|ללא|לא תועד|לא הודגם|חשד|ייתכן/i;
const lv = /left ventric|\blv\b|\blvef\b|חדר שמאל/i;
const weak =
  /reduced|decreased|impaired|hypokinesi|dysfunction|ירידה|מופחת|היפוקינ|פגיעה בתפקוד/i;
const sites: [FocusArea, RegExp][] = [
  ["lad", /\blad\b|left anterior descending|קדמי יורד/i],
  ["rca", /\brca\b|right coronary|כלילי ימני/i],
  ["lcx", /\blcx\b|circumflex|עורק עוקף/i],
  ["mitral", /mitral|מיטרל/i],
  ["aortic", /aortic valve|מסתם אבי העורקים|מסתם אאורטל/i],
  ["atria", /atrial fibrillation|פרפור פרוזדורים/i],
];
export function medicalVisualFocus(
  slide: MedicalSlide,
  bundle: MedicalBundle,
): MedicalFocus | null {
  for (const fact of slide.bullets) {
    const text = fact.text.en + " " + fact.text.he;
    if (denied.test(text)) continue;
    const quotes = fact.refs
      .filter((ref) => {
        const record = bundle.records.find(
            (record) => record.id === ref.record_id,
          ),
          entry = record?.entries.find((entry) => entry.id === ref.entry_id);
        return (
          record?.association_verified &&
          entry?.text.includes(ref.quote) &&
          !denied.test(entry.text)
        );
      })
      .map((ref) => ref.quote)
      .filter((quote) => !denied.test(quote));
    if (!quotes.length) continue;
    const historical =
      /historical|previous|prior|history of|in the past|היסטורי|בעבר|רקע של/i.test(
        text,
      );
    if (
      slide.kind === "pumping" &&
      lv.test(text) &&
      weak.test(text) &&
      quotes.some((quote) => lv.test(quote) && weak.test(quote))
    )
      return { area: "lv", mode: "comparison", fact, historical };
    if (
      slide.kind === "pumping" &&
      lv.test(text) &&
      !weak.test(text) &&
      quotes.some((quote) => lv.test(quote))
    )
      return { area: "lv", mode: "location", fact, historical };
    for (const [area, match] of sites) {
      const applicable = ["lad", "rca", "lcx"].includes(area)
        ? slide.kind === "coronary" || slide.kind === "stent"
        : area === "atria"
          ? slide.kind === "rhythm"
          : slide.kind === "valve";
      if (
        applicable &&
        match.test(text) &&
        quotes.some((quote) => match.test(quote))
      )
        return { area, mode: "location", fact, historical };
    }
  }
  return null;
}
