"use client";
import { useId } from "react";
import { useLanguage } from "./language-provider";
import type { SceneKind } from "@/lib/clinical/types";
export function ClinicalScene({
  kind,
  motion,
  intervention,
}: {
  kind: SceneKind;
  motion: boolean;
  intervention: boolean;
}) {
  const { t } = useLanguage(),
    id = useId();
  const gradient = id + "-body",
    vessel = id + "-vessel",
    glow = id + "-glow";
  if (kind === "care")
    return (
      <div className="care-visual">
        <div>
          01<span>{t("תיעוד התרופות")}</span>
        </div>
        <div>
          02<span>{t("החלטות עם הרופא")}</span>
        </div>
        <div>
          03<span>{t("מעקב ובדיקות")}</span>
        </div>
      </div>
    );
  if (kind === "coronary" || kind === "stent")
    return (
      <svg
        className="clinical-scene"
        viewBox="0 0 620 370"
        role="img"
        aria-label={t("הסבר סכמטי על עורק כלילי, ללא מדידה של המטופל")}
      >
        <defs>
          <linearGradient id={vessel} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#d38474" />
            <stop offset=".5" stopColor="#913c38" />
            <stop offset="1" stopColor="#4b202a" />
          </linearGradient>
          <filter id={glow}>
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <ellipse
          cx="310"
          cy="318"
          rx="240"
          ry="18"
          fill="#031917"
          opacity=".4"
        />
        <path
          d="M50 128C120 112 210 112 310 114S500 112 568 128L568 235C500 252 408 252 310 250S120 252 50 235Z"
          fill={"url(#" + vessel + ")"}
          stroke="#eaac94"
          strokeWidth="2"
        />
        <path
          d="M50 152C190 140 420 140 568 152L568 208C420 220 190 220 50 208Z"
          fill="#391c2b"
        />
        {!(kind === "stent" && intervention) && (
          <>
            <path
              d="M220 143C254 144 270 169 306 174C346 179 353 145 390 143Z"
              fill="#dab76a"
              stroke="#f4d990"
              strokeWidth="2"
            />
            <path
              d="M220 217C254 216 274 188 310 190C340 188 356 216 390 217Z"
              fill="#dab76a"
              stroke="#f4d990"
              strokeWidth="2"
            />
          </>
        )}
        {kind === "stent" && intervention && (
          <g stroke="#b5d6d9" strokeWidth="2" opacity=".95">
            <rect
              x="217"
              y="146"
              width="177"
              height="68"
              rx="13"
              fill="#66929d"
              opacity=".25"
            />
            {Array.from({ length: 9 }, (_, i) => (
              <path
                key={i}
                d={`M${220 + i * 20} 149l18 32-18 30m0-62l-18 32 18 30`}
              />
            ))}
          </g>
        )}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle
            key={i}
            cx={80 + i * 106}
            cy="181"
            r="8"
            fill="#f0ae99"
            opacity=".9"
          >
            {motion && (
              <animate
                attributeName="cx"
                from="65"
                to="552"
                dur="4s"
                begin={-i * 0.8 + "s"}
                repeatCount="indefinite"
              />
            )}
          </circle>
        ))}
        <path
          d="M80 280h104m-15-9 15 9-15 9"
          stroke="#a2c6b8"
          strokeWidth="3"
          fill="none"
        />
        <text x="80" y="308" fill="#cae2d7" fontSize="17">
          {t("זרימת דם — המחשה")}
        </text>
        <path d="M310 105V69" stroke="#bbd5c8" strokeWidth="1.5" />
        <text x="310" y="51" textAnchor="middle" fill="#eef6ee" fontSize="20">
          {kind === "stent" && intervention
            ? t("תמיכת תומכן — עיקרון כללי")
            : t("היצרות בעורק — עיקרון כללי")}
        </text>
      </svg>
    );
  return (
    <svg
      className={"clinical-scene " + (motion ? "scene-motion" : "")}
      viewBox="0 0 620 450"
      role="img"
      aria-label={t("לב סכמטי להמחשת תפקוד, אינו שחזור אנטומי של המטופל")}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#bcd2be" />
          <stop offset=".5" stopColor="#6a9b85" />
          <stop offset="1" stopColor="#345f55" />
        </linearGradient>
        <filter id={glow}>
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <circle
        cx="310"
        cy="234"
        r="165"
        fill="none"
        stroke="#6b9e8a"
        opacity=".2"
      />
      <circle
        cx="310"
        cy="234"
        r="125"
        fill="none"
        stroke="#6b9e8a"
        opacity=".2"
      />
      <ellipse cx="315" cy="391" rx="135" ry="17" fill="#031a17" opacity=".5" />
      <g className="heart-cutaway">
        <path
          d="M278 140C251 95 266 77 285 78L310 111L322 59L351 65L347 132L380 96L399 115L358 161Z"
          fill={"url(#" + gradient + ")"}
          stroke="#b2cec0"
          strokeWidth="2"
        />
        <path
          d="M270 136C220 119 167 167 177 226C188 291 246 351 312 383C370 359 415 289 431 223C448 153 407 116 364 145C335 124 299 125 270 136Z"
          fill={"url(#" + gradient + ")"}
          stroke="#afcebc"
          strokeWidth="2"
        />
        <path
          d="M260 166C224 145 190 173 199 217C219 228 247 224 268 210Z"
          fill="#6babc0"
          opacity=".85"
        />
        <path
          d="M323 164C346 143 391 158 395 194C376 219 353 224 323 211Z"
          fill="#db9b80"
          opacity=".9"
        />
        <path
          d="M269 231C237 224 211 240 233 281C251 316 277 339 299 351L301 228Z"
          fill="#488a9d"
          stroke="#9cc8ce"
          strokeWidth="2"
        />
        <path
          className={kind === "pumping" ? "ventricle-emphasis" : ""}
          d="M322 228C350 215 395 235 385 278C376 310 349 346 316 364Z"
          fill="#d39075"
          stroke="#f4c4a6"
          strokeWidth="3"
        />
        <path
          d="M306 163L303 357"
          stroke="#c5dece"
          strokeWidth="6"
          opacity=".8"
        />
        {kind === "valve" && (
          <g fill="#f5d7aa" stroke="#ffeacd" strokeWidth="2">
            <path className="valve-leaf" d="M317 213l22 27 11-23" />
            <path className="valve-leaf" d="M377 216l-23 27-10-25" />
          </g>
        )}
        {kind === "rhythm" && (
          <g stroke="#efc883" strokeWidth="3" fill="none">
            <path d="M265 174L292 192L315 208L339 241L326 270L350 310" />
            <circle
              className="rhythm-node"
              cx="265"
              cy="174"
              r="9"
              fill="#ffe8b8"
            />
          </g>
        )}
      </g>
      <path d="M386 285h108" stroke="#dbbc9c" strokeWidth="1.5" />
      <text x="500" y="281" fill="#f4d5b7" fontSize="18" textAnchor="end">
        {kind === "valve"
          ? t("תפקוד המסתם")
          : kind === "rhythm"
            ? t("תזמון האות החשמלי")
            : t("החדר השמאלי")}
      </text>
      <text x="310" y="422" textAnchor="middle" fill="#c9dfd2" fontSize="16">
        {t("תנועה סכמטית בלבד — לא מדידה קלינית")}
      </text>
    </svg>
  );
}
