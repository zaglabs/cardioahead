import type { ClinicalFact, ClinicalSlide, ClinicalSource } from "./types";
export type FocusArea =
  "lv" | "lad" | "rca" | "lcx" | "mitral" | "aortic" | "atria";
export type VisualFinding = {
  area: FocusArea;
  mode: "comparison" | "location";
  fact: ClinicalFact;
  historical: boolean;
};
const denied =
  /\b(no|not|without|unknown|uncertain|suspected|possible|unconfirmed|excluded|rule out)\b|אין|ללא|לא תועד|לא הודגם|לא צוין|לא מצוין|חשד|ייתכן/i;
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
// Limited, conservative association of an existing cited finding with a diagram.
// It does not diagnose, infer stenosis severity, reconstruct anatomy, or verify
// the original PDF's semantics. The clinician still reviews the cited source.
// Unsupported/negated/uncertain findings never produce a disease-shaped visual.
export function resolveVisualFinding(
  slide: ClinicalSlide,
  sources: ClinicalSource[],
): VisualFinding | null {
  let fallback: VisualFinding | null = null;
  for (const fact of slide.bullets) {
    const text = fact.text.en + " " + fact.text.he;
    if (denied.test(text)) continue;
    const refs = fact.refs.filter((ref) =>
      sources.some(
        (s) =>
          s.document_id === ref.document_id &&
          ref.page >= 1 &&
          ref.page <= s.pages,
      ),
    );
    if (!refs.length) continue;
    const quotes = refs
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
      quotes.some((q) => lv.test(q) && weak.test(q))
    )
      return { area: "lv", mode: "comparison", fact, historical };
    if (
      slide.kind === "pumping" &&
      lv.test(text) &&
      quotes.some((q) => lv.test(q))
    )
      if (!weak.test(text))
        fallback ||= { area: "lv", mode: "location", fact, historical };
    for (const [area, match] of sites) {
      const applicable = ["lad", "rca", "lcx"].includes(area)
        ? slide.kind === "coronary" || slide.kind === "stent"
        : area === "atria"
          ? slide.kind === "rhythm"
          : slide.kind === "valve";
      if (applicable && match.test(text) && quotes.some((q) => match.test(q)))
        return { area, mode: "location", fact, historical };
    }
  }
  return fallback;
}
