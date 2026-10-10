import http from "node:http";
const calls = [];
const paragraph =
  "In this fictional heart failure evidence fixture, treatment options require individual assessment of symptoms, kidney function, potassium and contraindications. This is a synthetic test passage, not a clinical recommendation.";
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url, "http://127.0.0.1:3197");
    if (url.pathname === "/calls") {
      res.end(JSON.stringify(calls));
      return;
    }
    if (url.pathname === "/search") {
      const query = url.searchParams.get("query") || "";
      calls.push(query);
      if (query.includes("myocarditis")) {
        res.statusCode = 503;
        res.end("{}");
        return;
      }
      if (query.includes("takotsubo")) {
        res.end(JSON.stringify({ hitCount: 0, resultList: { result: [] } }));
        return;
      }
      const cases = query.includes("Case Reports"),
        systematic = query.includes("Systematic Review");
      res.end(
        JSON.stringify({
          hitCount: 1,
          resultList: {
            result: [
              {
                id: cases ? "11111113" : systematic ? "11111112" : "11111111",
                source: "MED",
                title: cases
                  ? "Fictional case report of heart failure"
                  : systematic
                    ? "Fictional systematic review of heart failure"
                    : "Fictional guideline for heart failure",
                firstPublicationDate: "2025-01-01",
                authorList: {
                  author: [{ fullName: "Synthetic Study Author" }],
                },
                journalInfo: { journal: { title: "Fictional Test Journal" } },
                abstractText: cases
                  ? "This fictional case report describes heart failure with reduced left ventricular function. Clinical evaluation used renal function and potassium assessment; subsequent symptoms improved. A single case cannot establish comparative effectiveness."
                  : paragraph,
                pubTypeList: {
                  pubType: [
                    cases
                      ? "Case Reports"
                      : systematic
                        ? "Systematic Review"
                        : "Guideline",
                  ],
                },
                pmcid: systematic ? "PMC11111112" : "PMC11111111",
                isOpenAccess: cases ? "N" : "Y",
                doi: "10.0000/fictional-evidence-fixture",
              },
            ],
          },
        }),
      );
      return;
    }
    if (url.pathname === "/PMC11111111/fullTextXML") {
      res.setHeader("Content-Type", "application/xml");
      res.end(
        "<article><body><sec><p>" +
          paragraph +
          "</p><p>" +
          paragraph +
          "</p></sec></body></article>",
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  })
  .listen(3197, "127.0.0.1");
