"use client";
import { useId, useMemo } from "react";
import { useLanguage } from "./language-provider";
import { useStentExpansion, useReducedMotion } from "./use-illustration-motion";
import {
  cardiacCycle,
  arteryTravel,
  lumenRadius,
} from "@/lib/clinical/illustration-motion";
import type { SceneKind } from "@/lib/clinical/types";
type Props = { kind: SceneKind; progress: number; intervention: boolean };
function Cell({
  x,
  y,
  blue = false,
  angle = 0,
  opacity = 1,
}: {
  x: number;
  y: number;
  blue?: boolean;
  angle?: number;
  opacity?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} opacity={opacity}>
      <ellipse
        rx="6.5"
        ry="3.6"
        fill={blue ? "#68c4df" : "#ff9a8c"}
        stroke={blue ? "#b1e6ee" : "#ffd2ba"}
        strokeWidth=".8"
      />
      <ellipse
        rx="3.2"
        ry="1.4"
        fill={blue ? "#24718b" : "#af3c48"}
        opacity=".8"
      />
    </g>
  );
}
function Artery({
  progress,
  expanded,
  id,
  t,
}: {
  progress: number;
  expanded: number;
  id: string;
  t: (s: string) => string;
}) {
  const position = useMemo(() => arteryTravel(expanded), [expanded]);
  const samples = Array.from({ length: 51 }, (_, i) => 60 + i * 10);
  const upper = samples.map((x) => `${x},${210 - lumenRadius(x, expanded)}`);
  const lower = samples
    .toReversed()
    .map((x) => `${x},${210 + lumenRadius(x, expanded)}`);
  const lumen = "M" + upper.join(" L") + " L" + lower.join(" L") + " Z";
  const plaqueTop =
    "M160 167 L460 167 L" +
    samples
      .filter((x) => x >= 160 && x <= 460)
      .toReversed()
      .map((x) => `${x},${210 - lumenRadius(x, expanded)}`)
      .join(" L") +
    "Z";
  const plaqueBottom =
    "M160 253 L460 253 L" +
    samples
      .filter((x) => x >= 160 && x <= 460)
      .toReversed()
      .map((x) => `${x},${210 + lumenRadius(x, expanded)}`)
      .join(" L") +
    "Z";
  return (
    <svg
      className="clinical-scene artery-scene"
      viewBox="0 0 620 360"
      role="img"
      data-progress={progress.toFixed(4)}
      data-stent-expansion={expanded.toFixed(3)}
      aria-label={t("הסבר סכמטי על עורק כלילי, ללא מדידה של המטופל")}
    >
      <defs>
        <linearGradient id={id + "wall"} x2="0" y2="1">
          <stop stopColor="#f7ab8c" />
          <stop offset=".2" stopColor="#bf5f54" />
          <stop offset=".55" stopColor="#662733" />
          <stop offset="1" stopColor="#d57861" />
        </linearGradient>
        <linearGradient id={id + "blood"} x2="0" y2="1">
          <stop stopColor="#441623" />
          <stop offset=".45" stopColor="#862e3e" />
          <stop offset="1" stopColor="#2d1623" />
        </linearGradient>
        <linearGradient id={id + "plaque"} x2="0" y2="1">
          <stop stopColor="#f2d18a" />
          <stop offset=".6" stopColor="#c19a50" />
          <stop offset="1" stopColor="#a27638" />
        </linearGradient>
        <linearGradient id={id + "metal"} x2="0" y2="1">
          <stop stopColor="#e8f6ff" />
          <stop offset=".5" stopColor="#739eac" />
          <stop offset="1" stopColor="#d5e8ed" />
        </linearGradient>
        <clipPath id={id + "lumen"}>
          <path d={lumen} />
        </clipPath>
        <filter id={id + "shadow"} x="-30%" y="-40%" width="160%" height="180%">
          <feDropShadow
            dx="0"
            dy="14"
            stdDeviation="12"
            floodColor="#001510"
            floodOpacity=".65"
          />
        </filter>
      </defs>
      <text x="310" y="38" textAnchor="middle" fill="#f1f6ec" fontSize="21">
        {expanded > 0.6
          ? t("תמיכת תומכן — עיקרון כללי")
          : t("היצרות בעורק — עיקרון כללי")}
      </text>
      <path
        d="M310 54V112"
        stroke="#9cbeb0"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
      <g filter={`url(#${id}shadow)`}>
        <path
          d="M60 143Q310 110 560 143V277Q310 310 60 277Z"
          fill={`url(#${id}wall)`}
          stroke="#ecaa8c"
          strokeWidth="2"
        />
        <ellipse
          cx="560"
          cy="210"
          rx="14"
          ry="67"
          fill="#b96253"
          stroke="#f3b898"
          strokeWidth="2"
        />
        <path d="M60 168H560V252H60Z" fill={`url(#${id}blood)`} />
        <path
          className="artery-plaque"
          d={plaqueTop}
          fill={`url(#${id}plaque)`}
          stroke="#f6d690"
          strokeWidth="1.2"
        />
        <path
          className="artery-plaque"
          d={plaqueBottom}
          fill={`url(#${id}plaque)`}
          stroke="#f6d690"
          strokeWidth="1.2"
        />
        <g clipPath={`url(#${id}lumen)`}>
          {[0, 1, 2].flatMap((lane) =>
            Array.from({ length: 8 }, (_, i) => {
              const x = position(progress + i / 8 + lane * 0.039);
              const y = 210 + (lane - 1) * lumenRadius(x, expanded) * 0.54;
              const slope =
                (lumenRadius(x + 1, expanded) - lumenRadius(x - 1, expanded)) *
                0.5 *
                (lane - 1) *
                0.54;
              return (
                <Cell
                  key={lane + "-" + i}
                  x={x}
                  y={y}
                  angle={(Math.atan(slope) * 180) / Math.PI}
                />
              );
            }),
          )}
        </g>
        {expanded > 0 && (
          <g
            opacity={expanded}
            stroke={`url(#${id}metal)`}
            strokeWidth="2"
            fill="none"
          >
            {Array.from({ length: 11 }, (_, i) => {
              const x = 210 + i * 18,
                r = lumenRadius(x, expanded) + 2;
              return (
                <path key={i} d={`M${x} ${210 - r}l9 ${r} -9 ${r} -9 -${r}Z`} />
              );
            })}
            <path
              d={`M210 ${210 - lumenRadius(210, expanded) - 2}Q310 ${210 - lumenRadius(310, expanded) - 4}390 ${210 - lumenRadius(390, expanded) - 2}`}
            />
            <path
              d={`M210 ${210 + lumenRadius(210, expanded) + 2}Q310 ${210 + lumenRadius(310, expanded) + 4}390 ${210 + lumenRadius(390, expanded) + 2}`}
            />
          </g>
        )}
        <ellipse
          cx="60"
          cy="210"
          rx="14"
          ry="67"
          fill={`url(#${id}wall)`}
          stroke="#f1b494"
          strokeWidth="2"
        />
        <ellipse
          cx="60"
          cy="210"
          rx="9"
          ry="42"
          fill="#481b29"
          stroke="#e29b7f"
        />
        <ellipse
          cx="560"
          cy="210"
          rx="9"
          ry="42"
          fill="#4a1b29"
          opacity=".55"
        />
        <path
          d="M76 145Q310 116 545 143"
          stroke="#ffd1aa"
          strokeWidth="3"
          opacity=".5"
          fill="none"
        />
      </g>
      <path
        d="M80 322H200m-13-8 13 8-13 8"
        fill="none"
        stroke="#a8d5c3"
        strokeWidth="2.5"
      />
      <text x="214" y="328" fill="#d1e7db" fontSize="18">
        {t("זרימת דם — המחשה")}
      </text>
    </svg>
  );
}
function Heart({
  kind,
  progress,
  id,
  t,
}: {
  kind: SceneKind;
  progress: number;
  id: string;
  t: (s: string) => string;
}) {
  const cycle = cardiacCycle(progress),
    c = cycle.contraction;
  const mitralAngle = cycle.mitralOpen ? 28 : 0,
    aorticAngle = cycle.aorticOpen ? 35 : 0;
  const filling = cycle.mitralOpen,
    ejecting = cycle.aorticOpen;
  return (
    <svg
      className="clinical-scene heart-scene"
      viewBox="0 0 620 470"
      role="img"
      aria-label={t("לב סכמטי להמחשת תפקוד, אינו שחזור אנטומי של המטופל")}
      data-progress={progress.toFixed(4)}
      data-cardiac-phase={cycle.phase}
      data-mitral-open={cycle.mitralOpen}
      data-aortic-open={cycle.aorticOpen}
    >
      <defs>
        <linearGradient id={id + "muscle"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f2a18a" />
          <stop offset=".38" stopColor="#bc5d58" />
          <stop offset=".72" stopColor="#7f3543" />
          <stop offset="1" stopColor="#b55c58" />
        </linearGradient>
        <linearGradient id={id + "left"} x2=".6" y2="1">
          <stop stopColor="#ef8e7c" />
          <stop offset=".5" stopColor="#b83f52" />
          <stop offset="1" stopColor="#732f45" />
        </linearGradient>
        <linearGradient id={id + "right"} x2=".8" y2="1">
          <stop stopColor="#6ab8ce" />
          <stop offset=".5" stopColor="#347e9e" />
          <stop offset="1" stopColor="#23586e" />
        </linearGradient>
        <linearGradient id={id + "vessel"} x2="1" y2=".6">
          <stop stopColor="#f8b395" />
          <stop offset=".5" stopColor="#b56460" />
          <stop offset="1" stopColor="#793746" />
        </linearGradient>
        <radialGradient id={id + "shine"}>
          <stop stopColor="#fce2b8" stopOpacity=".4" />
          <stop offset="1" stopColor="#fce2b8" stopOpacity="0" />
        </radialGradient>
        <filter id={id + "shadow"} x="-40%" y="-30%" width="180%" height="170%">
          <feDropShadow
            dx="0"
            dy="12"
            stdDeviation="14"
            floodColor="#00160f"
            floodOpacity=".6"
          />
        </filter>
      </defs>
      <ellipse cx="312" cy="420" rx="135" ry="13" fill="#031d17" opacity=".5" />
      <circle
        cx="308"
        cy="244"
        r="174"
        fill="none"
        stroke="#75a88e"
        opacity=".15"
      />
      <g filter={`url(#${id}shadow)`}>
        {/* Aorta and pulmonary trunk remain connected to their ventricles. */}
        <path
          d="M333 216V126C333 65 270 65 271 120V150"
          fill="none"
          stroke="#773645"
          strokeWidth="31"
        />
        <path
          d="M333 216V126C333 65 270 65 271 120V150"
          fill="none"
          stroke={`url(#${id}vessel)`}
          strokeWidth="24"
        />
        <path
          d="M289 90L284 57M310 90L318 51M327 108L351 69"
          stroke="#d4907a"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M262 257C239 201 260 142 300 134L369 104"
          fill="none"
          stroke="#397f91"
          strokeWidth="25"
        />
        <path
          d="M262 257C239 201 260 142 300 134L369 104"
          fill="none"
          stroke="#79b5c4"
          strokeWidth="13"
          opacity=".65"
        />
        <path
          d="M211 174L196 116M206 210L179 239"
          stroke="#427f96"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M374 165L420 143M382 188L430 181"
          stroke="#c6756b"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <g
          transform={`translate(310 250) scale(${1 - c * 0.025} ${1 - c * 0.015}) translate(-310 -250)`}
        >
          <path
            d="M283 143C226 119 164 166 170 225C177 291 235 369 311 406C383 371 443 290 441 216C440 146 401 131 365 151C339 136 315 132 283 143Z"
            fill={`url(#${id}muscle)`}
            stroke="#e5a58b"
            strokeWidth="2"
          />
          <path
            d="M215 165C187 175 186 208 206 227C229 235 256 217 266 190C261 160 237 152 215 165Z"
            fill={`url(#${id}right)`}
            stroke="#a7d6dc"
            strokeWidth="1.5"
          />
          <path
            d="M348 164C374 145 407 166 407 197C394 217 365 225 340 211L337 184Z"
            fill={`url(#${id}left)`}
            stroke="#f0b7a2"
            strokeWidth="1.5"
          />
          <g
            transform={`translate(275 255) scale(${1 - c * 0.12} ${1 - c * 0.06}) translate(-275 -255)`}
          >
            <path
              d="M267 228C228 227 209 249 222 279C243 324 274 351 299 369L301 227Z"
              fill={`url(#${id}right)`}
              stroke="#8cbdc9"
              strokeWidth="2"
            />
          </g>
          <g
            className="lv-cavity"
            transform={`translate(343 314) scale(${1 - c * 0.2} ${1 - c * 0.1}) translate(-343 -314)`}
          >
            <path
              d="M336 228C365 213 410 239 399 278C388 322 355 365 324 388L324 250Z"
              fill={`url(#${id}left)`}
              stroke="#f5b59c"
              strokeWidth="2"
            />
            <path
              d="M342 238C364 225 393 247 382 283C372 318 349 345 337 355"
              fill="none"
              stroke="#ffbf9e"
              strokeWidth="3"
              opacity=".25"
            />
            <path
              d="M329 283L351 305L375 275M337 319L359 300"
              fill="none"
              stroke="#bd6a6b"
              strokeWidth="3"
              opacity=".6"
            />
          </g>
          <path
            d="M313 167C310 236 307 318 314 390"
            fill="none"
            stroke="#e09c87"
            strokeWidth="14"
          />
          <path
            d="M311 169C310 233 307 313 314 390"
            fill="none"
            stroke="#f4c5a6"
            strokeWidth="3"
            opacity=".6"
          />
          {/* Mitral valve opens for filling and closes before ventricular ejection. */}
          <g
            stroke="#ffe0a8"
            strokeWidth={kind === "valve" ? 5 : 3}
            fill="none"
          >
            <path
              transform={`rotate(${mitralAngle} 337 224)`}
              d="M337 224L359 231"
            />
            <path
              transform={`rotate(${-mitralAngle} 381 224)`}
              d="M381 224L359 231"
            />
            <path
              transform={`rotate(${-aorticAngle} 323 205)`}
              d="M323 205L333 212"
            />
            <path
              transform={`rotate(${aorticAngle} 343 205)`}
              d="M343 205L333 212"
            />
          </g>
          <ellipse
            cx="251"
            cy="177"
            rx="55"
            ry="38"
            fill={`url(#${id}shine)`}
            opacity=".4"
          />
        </g>
        {filling &&
          Array.from({ length: 4 }, (_, i) => {
            const q = (progress * 2.8 + i / 4) % 1;
            return (
              <Cell
                key={i}
                x={363 - 21 * q}
                y={180 + 166 * q}
                angle={78}
                opacity={Math.sin(q * Math.PI)}
              />
            );
          })}
        {ejecting &&
          Array.from({ length: 5 }, (_, i) => {
            const q = ((progress - 0.46) / 0.22 + i / 5) % 1;
            const x = q < 0.58 ? 334 : 334 - (q - 0.58) * 145;
            const y = q < 0.58 ? 318 - q * 380 : 98 + (q - 0.58) * 70;
            return (
              <Cell
                key={i}
                x={x}
                y={y}
                angle={-80}
                opacity={Math.sin(q * Math.PI)}
              />
            );
          })}
        {kind === "rhythm" && (
          <g fill="none" stroke="#f1d19c" strokeWidth="3">
            <path d="M224 177Q282 176 305 223L316 282M305 223L264 284M316 282L363 335" />
            <circle
              cx="224"
              cy="177"
              r="9"
              fill="#fff1b7"
              opacity={progress < 0.17 ? 1 : 0.4}
            />
            <circle
              cx="305"
              cy="223"
              r="6"
              fill="#fff1b7"
              opacity={progress > 0.18 && progress < 0.4 ? 1 : 0.35}
            />
            <path
              d="M305 223L316 282L363 335M305 223L264 284"
              stroke="#fff3c9"
              strokeWidth="5"
              opacity={progress > 0.4 && progress < 0.6 ? 1 : 0.15}
            />
          </g>
        )}
      </g>
      <path
        d="M379 314L453 314"
        fill="none"
        stroke="#efcaaa"
        strokeWidth="1.5"
      />
      <text x="460" y="309" fill="#f2ddbe" fontSize="17">
        {t("החדר השמאלי")}
      </text>
      <path
        d="M392 191L453 191"
        fill="none"
        stroke="#efcaaa"
        strokeWidth="1.5"
      />
      <text x="460" y="187" fill="#f2ddbe" fontSize="17">
        {t("העלייה השמאלית")}
      </text>
    </svg>
  );
}
export function ClinicalScene({ kind, progress, intervention }: Props) {
  const { t } = useLanguage(),
    id = useId().replace(/:/g, ""),
    reduced = useReducedMotion();
  const expansion = useStentExpansion(
    kind === "stent" && intervention,
    reduced,
  );
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
  const artery = kind === "coronary" || kind === "stent";
  const cycle = cardiacCycle(progress);
  return (
    <div className="mechanism-visual">
      {artery ? (
        <Artery progress={progress} expanded={expansion} id={id} t={t} />
      ) : (
        <Heart kind={kind} progress={progress} id={id} t={t} />
      )}
      <div className="mechanism-caption">
        <span className="mechanism-phase">
          {artery
            ? t("זרימה בכיוון אחד")
            : cycle.phase === "filling"
              ? t("מילוי החדר")
              : cycle.phase === "contraction"
                ? t("תחילת ההתכווצות")
                : cycle.phase === "ejection"
                  ? t("התכווצות ופליטה")
                  : t("הרפיה")}
        </span>
        <p>
          {artery
            ? t("החלקיקים מואצים במעבר הצר. הרובד נשאר בדופן.")
            : cycle.phase === "filling"
              ? t("המסתם המיטרלי פתוח; דם נכנס לחדר השמאלי.")
              : cycle.phase === "contraction"
                ? t("שני המסתמים סגורים לזמן קצר בתחילת ההתכווצות.")
                : cycle.phase === "ejection"
                  ? t("המסתם המיטרלי נסגר; דם נפלט דרך מסתם אבי העורקים.")
                  : t("החדר נרפה; מסתם אבי העורקים נסגר לפני המילוי הבא.")}
        </p>
        <small>{t("המחשה מואטת של מנגנון כללי — לא מדידה של המטופל")}</small>
      </div>
    </div>
  );
}
