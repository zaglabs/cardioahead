import type { LocalizedReport } from "@/lib/visit/types";
export function VisitReportView({ report }: { report: LocalizedReport }) {
  return (
    <article
      className="visit-patient-report"
      lang={report.language}
      dir={report.language === "he" ? "rtl" : "ltr"}
    >
      <header>
        <span className="report-brand" dir="ltr">
          cardioahead.
        </span>
        <h1>{report.report_title}</h1>
        <dl>
          <div>
            <dt>{report.labels.patient}</dt>
            <dd dir="auto">{report.patient_name}</dd>
          </div>
          {report.patient_reference && (
            <div>
              <dt>{report.labels.reference}</dt>
              <dd dir="auto">{report.patient_reference}</dd>
            </div>
          )}
          <div>
            <dt>{report.labels.visit_date}</dt>
            <dd dir="ltr">{report.visit_date}</dd>
          </div>
          <div>
            <dt>{report.labels.clinician}</dt>
            <dd dir="auto">{report.clinician_name}</dd>
          </div>
        </dl>
        <p dir="auto">{report.clinic_name}</p>
      </header>
      {report.sections.map((section) => (
        <section key={section.key}>
          <h2>{section.title}</h2>
          <p dir="auto">{section.text}</p>
        </section>
      ))}
      <section className="report-next-steps">
        <h2>{report.next_steps_title}</h2>
        <ol>
          {report.next_steps.map((step, i) => (
            <li key={i} dir="auto">
              {step}
            </li>
          ))}
        </ol>
      </section>
      <footer>
        <h2>{report.labels.contact}</h2>
        <p dir="auto">{report.clinic_contact}</p>
      </footer>
    </article>
  );
}
