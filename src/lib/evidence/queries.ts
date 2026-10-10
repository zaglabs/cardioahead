import type { PatientContext } from "./types";
// Only this vocabulary can reach public literature services. Never concatenate
// clinician input, document text, identifiers, dates or record labels into queries.
export const vocabulary = [
  {
    id: "heart_failure",
    pattern:
      /heart failure|HFrEF|reduced.*(?:systolic|ventricular).*function|אי.?ספיקת לב|ירידה בתפקוד הסיסטולי/i,
    terms: '("heart failure" OR "left ventricular dysfunction" OR HFrEF)',
  },
  {
    id: "coronary_disease",
    pattern:
      /coronary.*disease|ischemic|ischaemic|LAD|PCI|מחלה כלילית|כלילי|צנתור/i,
    terms:
      '("coronary artery disease" OR "chronic coronary syndrome" OR ischemic cardiomyopathy)',
  },
  {
    id: "atrial_fibrillation",
    pattern: /atrial fibrillation|פרפור פרוזדורים/i,
    terms: '("atrial fibrillation" OR AF)',
  },
  {
    id: "aortic_stenosis",
    pattern: /aortic stenosis|היצרות.*אאורט/i,
    terms: '("aortic stenosis" OR "aortic valve stenosis")',
  },
  {
    id: "mitral_regurgitation",
    pattern: /mitral regurgitation|אי.?ספיקה מיטרלית/i,
    terms: '("mitral regurgitation" OR "mitral insufficiency")',
  },
  {
    id: "cardiac_amyloidosis",
    pattern: /amyloid|עמילואיד/i,
    terms: '("cardiac amyloidosis" OR "transthyretin cardiomyopathy")',
  },
  {
    id: "hypertrophic_cardiomyopathy",
    pattern: /hypertrophic cardiomyopathy|קרדיומיופתיה היפרטרופית/i,
    terms: '("hypertrophic cardiomyopathy" OR HCM)',
  },
  {
    id: "myocarditis",
    pattern: /myocarditis|מיוקרדיטיס/i,
    terms: '(myocarditis OR "inflammatory cardiomyopathy")',
  },
  {
    id: "takotsubo",
    pattern: /takotsubo|טקוצובו/i,
    terms: '(takotsubo OR "stress cardiomyopathy")',
  },
  {
    id: "cardiac_sarcoidosis",
    pattern: /sarcoid|סרקואיד/i,
    terms: '("cardiac sarcoidosis")',
  },
  {
    id: "sglt2",
    pattern: /SGLT2|dapagliflozin|empagliflozin|דפגליפלוזין|אמפגליפלוזין/i,
    terms: "(SGLT2 OR dapagliflozin OR empagliflozin)",
  },
  {
    id: "defibrillator",
    pattern: /\bICD\b|defibrillator|דפיברילטור/i,
    terms: '("implantable cardioverter defibrillator" OR ICD)',
  },
  {
    id: "resynchronization",
    pattern: /\bCRT\b|resynchroni[sz]ation/i,
    terms: '("cardiac resynchronization therapy" OR CRT)',
  },
];
export function searchTopics(context: PatientContext, question: string) {
  const clinical = context.facts
    .map(
      (f) =>
        f.fact.text.en +
        " " +
        f.fact.text.he +
        " " +
        f.fact.refs.map((r) => r.quote).join(" "),
    )
    .join(" ");
  const documented = vocabulary.filter((v) => v.pattern.test(clinical));
  const questioned = vocabulary.filter((v) => v.pattern.test(question));
  return [...new Set([...documented, ...questioned].map((v) => v.id))].slice(
    0,
    5,
  );
}
const titleTerms: Record<string, string> = {
  heart_failure:
    '(TITLE:"heart failure" OR TITLE:"ventricular dysfunction" OR TITLE:HFrEF)',
  coronary_disease:
    '(TITLE:"coronary artery disease" OR TITLE:"coronary syndrome" OR TITLE:"ischemic cardiomyopathy" OR TITLE:"ischaemic cardiomyopathy")',
  atrial_fibrillation: 'TITLE:"atrial fibrillation"',
  aortic_stenosis: 'TITLE:"aortic stenosis"',
  mitral_regurgitation: 'TITLE:"mitral regurgitation"',
  cardiac_amyloidosis:
    '(TITLE:"cardiac amyloidosis" OR TITLE:"transthyretin cardiomyopathy")',
  hypertrophic_cardiomyopathy: 'TITLE:"hypertrophic cardiomyopathy"',
  myocarditis: "TITLE:myocarditis",
  takotsubo: "TITLE:takotsubo",
  cardiac_sarcoidosis: 'TITLE:"cardiac sarcoidosis"',
  sglt2: "(TITLE:SGLT2 OR TITLE:dapagliflozin OR TITLE:empagliflozin)",
  defibrillator: "(TITLE:defibrillator OR TITLE:ICD)",
  resynchronization: 'TITLE:"resynchronization"',
};
export function buildQueries(topics: string[]) {
  const terms = topics
    .map((id) => vocabulary.find((v) => v.id === id)?.terms)
    .filter(Boolean);
  if (!terms.length) return [];
  const title = topics
    .slice(0, 2)
    .map((id) => titleTerms[id])
    .filter(Boolean)
    .join(" OR ");
  const base =
    "SRC:MED AND (" +
    terms.slice(0, 2).join(" OR ") +
    ")" +
    (title ? " AND (" + title + ")" : "");
  return [
    base +
      ' AND (TITLE:"ESC Guidelines" OR TITLE:"ESC/EACTS" OR TITLE:"ESC/ERS")',
    base +
      ' AND TITLE:guideline AND (TITLE:AHA OR TITLE:ACC OR TITLE:"American Heart Association" OR TITLE:"American College of Cardiology")',
    base + ' AND (PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Meta-Analysis")',
    base +
      ' AND (PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Clinical Trial")',
    base + ' AND (PUB_TYPE:"Case Reports" OR TITLE:"case series")',
    ...(terms.length > 2
      ? [
          "SRC:MED AND " +
            terms[0] +
            " AND (" +
            terms.slice(2).join(" OR ") +
            ")" +
            (title ? " AND (" + title + ")" : ""),
        ]
      : []),
  ];
}
