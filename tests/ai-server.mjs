import http from "node:http";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const fixtures = JSON.parse(
  fs.readFileSync("src/lib/test-documents.json", "utf8"),
);
const calls = [];
const bi = (en, he) => ({ en, he });
const titles = {
  referral: bi("Reason for referral", "סיבת ההפניה"),
  history: bi("Cardiac history", "רקע לבבי"),
  findings: bi("Documented findings", "ממצאים מתועדים"),
  medications: bi("Medication reconciliation", "בירור רשימת התרופות"),
  allergies: bi("Allergies", "אלרגיות"),
  plan: bi("Documented plan", "תכנית מתועדת"),
};
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/calls") {
      res.end(JSON.stringify(calls));
      return;
    }
    if (
      req.method !== "POST" ||
      !["/responses", "/messages"].includes(req.url)
    ) {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    let raw = "";
    for await (const c of req) raw += c;
    const payload = JSON.parse(raw);
    const claude = req.url === "/messages";
    if (
      claude
        ? req.headers["x-api-key"] !== "local-claude-test-key" ||
          req.headers["anthropic-version"] !== "2023-06-01" ||
          !payload.output_config?.format?.schema
        : req.headers.authorization !== "Bearer local-ai-test-key" ||
          payload.store !== false ||
          payload.text.format.strict !== true
    ) {
      res.statusCode = 400;
      res.end("{}");
      return;
    }
    const inputs = claude
        ? payload.messages[0].content
        : payload.input[0].content,
      docs = [];

    let evidenceTask = null;
    try {
      evidenceTask = JSON.parse(inputs[0]?.text || "");
    } catch {}
    if (
      evidenceTask?.task === "evidence_draft" ||
      evidenceTask?.task === "evidence_verify"
    ) {
      const result =
        evidenceTask.task === "evidence_verify"
          ? {
              patient_results: evidenceTask.patient.map((f) => ({
                index: f.id,
                supported: true,
              })),
              results: evidenceTask.claims.map(({ index, claim }) => ({
                index,
                supported: !claim.text.en.includes(
                  "unsupported interpretation",
                ),
              })),
            }
          : (() => {
              const p = evidenceTask,
                source = p.literature.find((s) => s.access !== "metadata_only");
              if (!source) return { claims: [] };
              const refs = [
                {
                  source_id: source.id,
                  quote: source.text.split("\n")[0].slice(0, 440),
                },
              ];
              const base = {
                section: "options",
                stance: "context",
                title: bi("Assess patient applicability", "הערכת התאמה למטופל"),
                text: bi(
                  "For clinician consideration: assess symptoms, renal function, potassium and contraindications before judging applicability.",
                  "לעיון הרופא: יש לברר תסמינים, תפקוד כליות, אשלגן והתוויות נגד לפני הערכת ההתאמה.",
                ),
                patient_fact_ids: [p.patient[0].id],
                refs,
                recommendation_class: "",
                evidence_level: "",
              };
              const claims = [base];
              if (source.evidence_type === "guideline")
                claims.push({
                  ...base,
                  section: "guidelines",
                  title: bi(
                    "Available guideline evidence",
                    "ראיות הנחיה זמינות",
                  ),
                });
              const report = p.literature.find(
                (s) => s.evidence_type === "case_report_or_series",
              );
              if (report)
                claims.push({
                  ...base,
                  section: "cases",
                  title: bi(
                    "Limited case-report evidence",
                    "ראיות מוגבלות מתיאור מקרה",
                  ),
                  text: bi(
                    "This single fictional case reported symptom improvement after evaluation; it cannot establish comparative effectiveness or predict this patient's outcome.",
                    "במקרה הפיקטיבי היחיד דווח על שיפור בתסמינים לאחר בירור; אין להסיק יעילות השוואתית או לחזות תוצאה למטופל זה.",
                  ),
                  refs: [
                    { source_id: report.id, quote: report.text.slice(0, 440) },
                  ],
                });
              if (p.question_kind === "plan")
                for (const stance of ["support", "concern", "alternative"])
                  claims.push({ ...base, section: "proposed_plan", stance });
              if (p.question.includes("unsupported")) {
                claims.push({
                  ...base,
                  refs: [{ source_id: "PMID:99999999", quote: refs[0].quote }],
                });
                claims.push({
                  ...base,
                  text: bi(
                    "An unsupported interpretation predicts a different EF.",
                    "פרשנות ללא תמיכה חוזה EF שונה.",
                  ),
                });
              }
              return { claims };
            })();
      calls.push({
        task: evidenceTask.task,
        ids: evidenceTask.patient.flatMap((f) =>
          f.fact.refs.map((r) => r.document_id),
        ),
        provider: claude ? "claude" : "openai",
        model: payload.model,
      });
      res.end(
        JSON.stringify(
          claude
            ? {
                stop_reason: "end_turn",
                content: [{ type: "text", text: JSON.stringify(result) }],
              }
            : {
                status: "completed",
                output: [
                  {
                    type: "message",
                    content: [
                      { type: "output_text", text: JSON.stringify(result) },
                    ],
                  },
                ],
              },
        ),
      );
      return;
    }

    for (let i = 0; i < inputs.length; i += 2) {
      const metadata = JSON.parse(
        inputs[i].text.slice(inputs[i].text.indexOf("{")),
      );
      const file = inputs[i + 1];
      const digest = createHash("sha256")
        .update(
          Buffer.from(
            claude ? file.source.data : file.file_data.split(",")[1],
            "base64",
          ),
        )
        .digest("hex");
      const match = fixtures.find((f) => f.sha256 === digest);
      if (
        !match ||
        (!claude && !/^source-\d+\.pdf$/.test(file.filename)) ||
        Object.hasOwn(metadata, "filename")
      ) {
        res.statusCode = 400;
        res.end("{}");
        return;
      }
      docs.push({ ...metadata, type: match.filename });
    }
    calls.push({
      ids: docs.map((d) => d.document_id),
      model: payload.model,
      provider: claude ? "claude" : "openai",
    });
    const source =
      docs.find((d) => d.type.includes("echocardiogram")) || docs[0];
    const echo = source.type.includes("echocardiogram");
    const refs = [
      {
        document_id: source.document_id,
        page: 1,
        quote: echo
          ? "הרחבה קלה של חדר שמאל וירידה בתפקוד הסיסטולי."
          : "קוצר נשימה במאמץ ועייפות שהופיעו בהדרגה בשלושת החודשים האחרונים.",
      },
    ];
    const overview = {
      text: echo
        ? bi(
            "The fictional echo describes reduced left ventricular systolic function.",
            "האקו הפיקטיבי מתאר ירידה בתפקוד הסיסטולי של חדר שמאל.",
          )
        : bi(
            "The fictional referral describes gradual exertional breathlessness and fatigue.",
            "ההפניה הפיקטיבית מתארת קוצר נשימה במאמץ ועייפות שהופיעו בהדרגה.",
          ),
      date: null,
      refs,
    };
    const summary = {
      overview,
      sections: Object.entries(titles).map(([kind, title]) => ({
        kind,
        title,
        items: kind === "findings" ? [overview] : [],
        missing:
          kind === "findings"
            ? []
            : [
                bi(
                  "Confirm missing details with the clinic; do not assume a normal result.",
                  "יש לברר פרטים חסרים עם המרפאה; אין להניח תוצאה תקינה.",
                ),
              ],
      })),
      questions: [
        bi(
          "Which prior studies should be compared at the visit?",
          "לאילו בדיקות קודמות כדאי להשוות בפגישה?",
        ),
      ],
      conflicts: [],
      limitations: [
        bi(
          "Fictional test case; draft requires clinician review.",
          "מקרה בדיקה פיקטיבי; הטיוטה דורשת עיון רופא.",
        ),
      ],
      presentation: {
        eligible: true,
        reason: bi(
          "A schematic can explain the documented issue. It is not a reconstruction of the patient's anatomy.",
          "אפשר להסביר את הממצא המתועד בהמחשה סכמטית, שאינה שחזור של אנטומיית המטופל.",
        ),
        slides: [
          {
            kind: "pumping",
            title: bi(
              "Understanding heart pumping",
              "הבנת פעולת השאיבה של הלב",
            ),
            explanation: bi(
              "Show the left ventricle and discuss the documented findings without predicting treatment response.",
              "מציגים את החדר השמאלי ודנים בממצאים המתועדים, ללא חיזוי תגובה לטיפול.",
            ),
            bullets: [overview],
            key_value: null,
          },
          {
            kind: "care",
            title: bi("Discussing the next steps", "שיחה על הצעדים הבאים"),
            explanation: bi(
              "Review the records and clarify the plan with Prof. Maor. This is not a new treatment recommendation.",
              "עוברים על המסמכים ומבררים את התכנית עם פרופ׳ מאור. אין זו המלצה חדשה לטיפול.",
            ),
            bullets: [overview],
            key_value: null,
          },
        ],
      },
    };
    if (claude) {
      // Exercise the actual non-nullable Claude wire format.
      const wire = JSON.parse(
        JSON.stringify(summary, (key, value) =>
          value === null && key === "date"
            ? ""
            : value === null && key === "key_value"
              ? { he: "", en: "" }
              : value,
        ),
      );
      res.end(
        JSON.stringify({
          id: randomUUID(),
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(wire) }],
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        id: randomUUID(),
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(summary) }],
          },
        ],
      }),
    );
  })
  .listen(3198, "127.0.0.1");
