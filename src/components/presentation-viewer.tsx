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
import {
  useIllustrationMotion,
  useReducedMotion,
} from "./use-illustration-motion";
import type { PresentationRecord } from "@/lib/clinical/types";
export function PresentationViewer({ record }: { record: PresentationRecord }) {
  const { language, t } = useLanguage();
  const [index, setIndex] = useState(0),
    [motion, setMotion] = useState(true),
    [slow, setSlow] = useState(false),
    [intervention, setIntervention] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const slide = record.content.slides[index];
  const count = record.content.slides.length;
  const reducedMotion = useReducedMotion();
  const { progress, seek } = useIllustrationMotion(
    motion && !reducedMotion && slide.kind !== "care",
    slow ? 0.5 : 1,
  );
  const cardiac =
    slide.kind === "pumping" ||
    slide.kind === "valve" ||
    slide.kind === "rhythm";
  function inspectPhase(value: number) {
    setMotion(false);
    seek(value);
  }
  function move(next: number) {
    setIndex(next);
    setIntervention(false);
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
          <span className="eyebrow">{t("הסבר לשיחה עם הרופא")}</span>
          <h3>{slide.title[language]}</h3>
          <p>{slide.explanation[language]}</p>
          {slide.key_value && (
            <div className="recorded-measurement">
              <span>{t("נתון מתועד במסמכים")}</span>
              <strong>{slide.key_value[language]}</strong>
            </div>
          )}
        </div>
        <div className="presentation-graphic">
          {slide.kind !== "care" && (
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
          <ClinicalScene
            kind={slide.kind}
            progress={progress}
            intervention={intervention}
          />
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
        {slide.kind === "stent" && (
          <button
            className="text-button"
            onClick={() => setIntervention(!intervention)}
          >
            {intervention ? t("המחשת היצרות") : t("המחשת תמיכת תומכן")}
          </button>
        )}
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
              target="_blank"
              rel="noreferrer"
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
          "המחשה לימודית המבוססת על המסמכים. אינה שחזור אנטומי, מדידת זרימה או תחזית טיפול. הרופא מאשר את ההסבר ואת בחירת הטיפול.",
        )}
      </p>
    </div>
  );
}
