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
import type { PresentationRecord } from "@/lib/clinical/types";
export function PresentationViewer({ record }: { record: PresentationRecord }) {
  const { language, t } = useLanguage();
  const [index, setIndex] = useState(0),
    [motion, setMotion] = useState(false),
    [intervention, setIntervention] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const slide = record.content.slides[index];
  const count = record.content.slides.length;
  function move(next: number) {
    setIndex(next);
    setIntervention(false);
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
          <ClinicalScene
            kind={slide.kind}
            motion={motion}
            intervention={intervention}
          />
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
        <button className="text-button" onClick={() => setMotion(!motion)}>
          {motion ? <Pause size={17} /> : <Play size={17} />}{" "}
          {motion ? t("עצירת התנועה") : t("הפעלת ההמחשה")}
        </button>
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
