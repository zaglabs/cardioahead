export function HeartIllustration() {
  return (
    <svg
      className="heart-illustration"
      viewBox="0 0 480 500"
      fill="none"
      role="img"
      aria-label="איור לב סכמטי לקישוט, אינו מציג מידע רפואי של מטופל"
    >
      <defs>
        <linearGradient
          id="heart-body"
          x1="124"
          y1="155"
          x2="334"
          y2="422"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9FB6AC" />
          <stop offset=".5" stopColor="#658B7C" />
          <stop offset="1" stopColor="#345D51" />
        </linearGradient>
        <linearGradient
          id="heart-vessel"
          x1="208"
          y1="44"
          x2="284"
          y2="211"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D3DED5" />
          <stop offset="1" stopColor="#5F8C7B" />
        </linearGradient>
        <linearGradient
          id="heart-side"
          x1="131"
          y1="198"
          x2="307"
          y2="396"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#B4C6B8" />
          <stop offset="1" stopColor="#527B69" />
        </linearGradient>
        <filter
          id="heart-shadow"
          x="0"
          y="0"
          width="480"
          height="500"
          filterUnits="userSpaceOnUse"
        >
          <feDropShadow
            dx="5"
            dy="24"
            stdDeviation="18"
            floodColor="#153F31"
            floodOpacity=".12"
          />
        </filter>
      </defs>
      <g opacity=".35" stroke="#ADC4B3">
        <circle cx="240" cy="242" r="176" />
        <circle cx="240" cy="242" r="137" />
        <path d="M240 42v398M40 242h400" strokeDasharray="3 8" />
      </g>
      <g filter="url(#heart-shadow)">
        <path
          d="M215 174c-35-23-42-47-31-77 12-31 39-43 70-38 34 6 55 35 52 77l-5 54-34-4 6-54c2-22-6-34-22-37-17-3-27 5-31 17-7 19 0 29 20 39z"
          fill="url(#heart-vessel)"
          stroke="#648A78"
          strokeWidth="1.5"
        />
        <path
          d="m239 72 2-32 21 1-1 34M273 83l12-33 20 8-13 35M302 107l24-27 16 13-29 29"
          fill="url(#heart-vessel)"
          stroke="#648A78"
          strokeWidth="1.5"
        />
        <path
          d="M152 213c-22-38-18-77-2-106l32 16c-14 25-13 48 4 75z"
          fill="url(#heart-vessel)"
          stroke="#648A78"
          strokeWidth="1.5"
        />
        <path
          d="M277 174c22-32 49-46 91-43l-2 31c-32-1-47 8-58 32z"
          fill="url(#heart-side)"
          stroke="#648A78"
          strokeWidth="1.5"
        />
        <path
          d="M222 177c28-21 76-15 101 20 32 45 28 102 5 150-21 44-59 74-92 86-37-28-80-54-111-96-30-41-39-88-22-122 20-40 71-52 104-30z"
          fill="url(#heart-body)"
          stroke="#436D5B"
          strokeWidth="1.5"
        />
        <path
          d="M211 185c-28 4-50 25-57 57-14 66 29 126 82 191-46-21-87-51-111-96-30-41-39-88-22-122 20-40 71-52 104-30z"
          fill="url(#heart-side)"
          opacity=".8"
        />
        <path
          d="M231 198c-9 40-9 70 0 104 10 36 16 74 8 115"
          stroke="#CBD7C6"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M231 241c25-5 44-20 58-43M229 274c-24-6-41-20-55-42M236 321c25-9 45-25 55-44M238 351c-16-5-30-15-41-27"
          stroke="#CBD7C6"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M270 219c22 44 22 98-3 136"
          stroke="#C2D0BE"
          strokeOpacity=".3"
          strokeWidth="13"
          strokeLinecap="round"
        />
      </g>
      <g fill="#537A65">
        <circle cx="117" cy="145" r="4" />
        <circle cx="369" cy="324" r="4" />
        <circle cx="77" cy="319" r="3" />
      </g>
    </svg>
  );
}
