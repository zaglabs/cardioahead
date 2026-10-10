"use client";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Play,
  Pause,
  ShieldCheck,
} from "lucide-react";
import { useLanguage } from "./language-provider";
import { ClinicalScene } from "./clinical-scene";
import { useDocumentPreview } from "./document-preview";
import {
  useIllustrationMotion,
  useReducedMotion,
} from "./use-illustration-motion";
import type { PresentationRecord } from "@/lib/clinical/types";
import { resolveVisualFinding } from "@/lib/clinical/presentation-focus";
import { cardiacCycle } from "@/lib/clinical/illustration-motion";
export function PresentationViewer({ record }: { record: PresentationRecord }) {
  const { language, t } = useLanguage();
  const openDocument = useDocumentPreview();
  const [index, setIndex] = useState(0),
    [motion, setMotion] = useState(true),
    [slow, setSlow] = useState(false),
    [view, setView] = useState<"comparison" | "area">("comparison");
  const container = useRef<HTMLDivElement>(null);
  const slide = record.content.slides[index];
  const count = record.content.slides.length;
  const reducedMotion = useReducedMotion();
  const finding = resolveVisualFinding(slide, record.content.sources);
  const canAnimate = finding?.mode === "comparison";
  const { progress, seek } = useIllustrationMotion(
    motion && !reducedMotion && canAnimate,
    slow ? 0.5 : 1,
  );
  const cardiac = canAnimate;
  function inspectPhase(value: number) {
    setMotion(false);
    seek(value);
  }
  function move(next: number) {
    setIndex(next);
    setView("comparison");
    seek(0.16);
  }
  async function fullscreen() {
    if (container.current?.requestFullscreen)
      await container.current.requestFullscreen().catch(() => {});
  }
  return (
    <div className="presentation-viewer" ref={container}>
      <div className="presentation-toolbar">
        <span>
          {t("מצגת שמורה בתיק")} · {index + 1}/{count}
        </span>
        <button
          className="icon-button"
          aria-label={t("מסך מלא")}
          onClick={() => void fullscreen()}
        >
          <Maximize2 size={19} />
        </button>
      </div>
      <div className="presentation-stage">
        <div className="presentation-narrative">
          <span className="eyebrow">
            {t("להצגה בהנחיית הרופא במהלך הייעוץ")}
          </span>
          <h3>{slide.title[language]}</h3>
          {finding && (
            <div className="case-finding-preview">
              <span>
                {finding.historical
                  ? t("תיעוד היסטורי")
                  : t("הממצא המתועד בתיק")}
              </span>
              <p>{finding.fact.text[language]}</p>
              {finding.fact.date && <time>{finding.fact.date}</time>}
            </div>
          )}
          <details className="presentation-mechanism-detail">
            <summary>{t("הסבר נוסף לעיון הרופא")}</summary>
            <p>{slide.explanation[language]}</p>
          </details>
          {slide.key_value && (
            <div className="recorded-measurement">
              <span>{t("נתון מתועד במסמכים")}</span>
              <strong>{slide.key_value[language]}</strong>
            </div>
          )}
        </div>
        <div className="presentation-graphic">
          {canAnimate && (
            <>
              <div className="mechanism-controls">
                <button
                  className="mechanism-play"
                  aria-pressed={motion && !reducedMotion}
                  disabled={reducedMotion}
                  onClick={() => setMotion(!motion)}
                >
                  {motion && !reducedMotion ? (
                    <Pause size={18} />
                  ) : (
                    <Play size={18} />
                  )}
                  {motion && !reducedMotion
                    ? t("עצירת התנועה")
                    : t("הפעלת ההמחשה")}
                </button>
                <button
                  className="mechanism-speed"
                  aria-pressed={slow}
                  disabled={reducedMotion}
                  onClick={() => setSlow(!slow)}
                >
                  {t("הילוך איטי")}
                </button>
              </div>
              {reducedMotion && (
                <p className="mechanism-motion-note">
                  {t(
                    "הפחתת תנועה פעילה. ניתן לצפות בשלבי הפעולה בעזרת הכפתורים.",
                  )}
                </p>
              )}
            </>
          )}
          {slide.kind === "care" ? (
            <ClinicalScene kind="care" progress={0} intervention={false} />
          ) : finding ? (
            <>
              {finding.mode === "comparison" && (
                <div
                  className="patient-visual-switch"
                  role="group"
                  aria-label={t("תצוגת הממצא")}
                >
                  <button
                    aria-pressed={view === "comparison"}
                    onClick={() => setView("comparison")}
                  >
                    {t("השוואה לתפקוד תקין")}
                  </button>
                  <button
                    aria-pressed={view === "area"}
                    onClick={() => setView("area")}
                  >
                    {t("סימון האזור המתועד")}
                  </button>
                </div>
              )}
              {finding.mode === "comparison" && view === "comparison" ? (
                <div className="patient-heart-comparison">
                  <section data-view="reference">
                    <h4>{t("תפקוד תקין — תרשים ייחוס")}</h4>
                    <ClinicalScene
                      kind="pumping"
                      progress={progress}
                      intervention={false}
                      compact
                    />
                  </section>
                  <section data-view="patient">
                    <h4>{t("הממצא המתועד אצל המטופל")}</h4>
                    <ClinicalScene
                      kind="pumping"
                      progress={progress}
                      intervention={false}
                      focus={finding.area}
                      patient
                      compact
                    />
                  </section>
                </div>
              ) : (
                <div className="patient-area-view" data-view="patient">
                  <ClinicalScene
                    kind={slide.kind}
                    progress={canAnimate ? progress : 0.4}
                    intervention={false}
                    focus={finding.area}
                    patient={canAnimate}
                    locationOnly={!canAnimate}
                    compact
                  />
                </div>
              )}
              <div className="patient-visual-caption">
                <strong>
                  {t(
                    finding.area === "lv"
                      ? "החדר השמאלי"
                      : finding.area === "lad"
                        ? "העורק הקדמי היורד (LAD)"
                        : finding.area === "rca"
                          ? "העורק הכלילי הימני (RCA)"
                          : finding.area === "lcx"
                            ? "העורק העוקף (LCX)"
                            : finding.area === "mitral"
                              ? "המסתם המיטרלי"
                              : finding.area === "aortic"
                                ? "מסתם אבי העורקים"
                                : "העליות",
                  )}
                </strong>
                <p>
                  {canAnimate
                    ? t(
                        "התנועה מדגימה את הירידה המתועדת בתפקוד באופן איכותני; היא אינה חישוב של מקטע הפליטה או שחזור אנטומי.",
                      )
                    : finding.historical
                      ? t(
                          "הסימון מזהה אזור שהוזכר בתיעוד ההיסטורי. הוא אינו מציג היצרות או פגיעה נוכחית שלא תועדה.",
                        )
                      : t(
                          "הסימון מזהה את האזור שצוין במקור. חומרת הפגיעה והגאומטריה אינן מוסקות מהתרשים.",
                        )}
                </p>
                {canAnimate && (
                  <span className="mechanism-phase">
                    {t(
                      cardiacCycle(progress).phase === "filling"
                        ? "מילוי החדר"
                        : cardiacCycle(progress).phase === "ejection"
                          ? "התכווצות ופליטה"
                          : cardiacCycle(progress).phase === "contraction"
                            ? "תחילת ההתכווצות"
                            : "הרפיה",
                    )}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="unsupported-patient-visual">
              <p>
                {t(
                  "לא ניתן למפות בביטחון את הממצאים השמורים לתרשים נתמך. הרופא יכול לעיין במקורות; לא מוצגת פגיעה משוערת.",
                )}
              </p>
            </div>
          )}{" "}
          {cardiac && (
            <div className="mechanism-inspect">
              <button onClick={() => inspectPhase(0.2)}>
                {t("הצגת מילוי")}
              </button>
              <button onClick={() => inspectPhase(0.56)}>
                {t("הצגת פליטה")}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="presentation-facts">
        {slide.bullets.map((f, i) => (
          <div key={i}>
            <ShieldCheck size={18} />
            <p>{f.text[language]}</p>
          </div>
        ))}
      </div>
      <div className="presentation-controls">
        <div className="slide-navigation">
          <button
            className="icon-button"
            aria-label={t("שקף קודם")}
            disabled={index === 0}
            onClick={() => move(index - 1)}
          >
            <ArrowRight size={19} />
          </button>
          <button
            className="icon-button"
            aria-label={t("שקף הבא")}
            disabled={index === count - 1}
            onClick={() => move(index + 1)}
          >
            <ArrowLeft size={19} />
          </button>
        </div>
      </div>
      <div className="presentation-evidence">
        {slide.bullets
          .flatMap((f) => f.refs)
          .map((ref, i) => (
            <a
              key={i}
              href={
                "/api/clinic/documents/" + ref.document_id + "#page=" + ref.page
              }
              onClick={(event) => {
                event.preventDefault();
                openDocument({
                  id: ref.document_id,
                  filename:
                    record.content.sources.find(
                      (source) => source.document_id === ref.document_id,
                    )?.filename || t("מסמך רפואי"),
                  page: ref.page,
                });
              }}
            >
              {
                record.content.sources.find(
                  (s) => s.document_id === ref.document_id,
                )?.filename
              }{" "}
              · {t("עמוד")} {ref.page}
            </a>
          ))}
      </div>
      <p className="presentation-disclaimer">
        {t(
          "מצגת לעיון הרופא ולהצגה במהלך הייעוץ לפי שיקול דעתו. הממצאים והסימונים נשענים על המקורות המצוטטים; התרשימים סכמטיים ודורשים אימות קליני.",
        )}
      </p>
    </div>
  );
}
