import "server-only";
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { LocalizedReport } from "./types";
const fontPath = (name: string) =>
  path.join(process.cwd(), "public", "fonts", name);
Font.register({
  family: "CardioNoto",
  fonts: [
    { src: fontPath("NotoSans-Regular.ttf") },
    { src: fontPath("NotoSans-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.register({
  family: "CardioHebrew",
  fonts: [
    { src: fontPath("NotoSansHebrew-Regular.ttf") },
    { src: fontPath("NotoSansHebrew-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);
const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 58,
    paddingHorizontal: 44,
    fontSize: 11,
    lineHeight: 1.7,
    color: "#24433b",
    fontFamily: "CardioNoto",
  },
  header: {
    marginBottom: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#dfe5dc",
  },
  brand: {
    fontFamily: "CardioNoto",
    fontSize: 14,
    color: "#173d34",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: 700, color: "#173d34", marginBottom: 12 },
  identity: { fontSize: 11, marginBottom: 4 },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#173d34",
    marginBottom: 7,
  },
  body: { fontSize: 11, lineHeight: 1.8 },
  goals: {
    padding: 14,
    backgroundColor: "#eef3e8",
    borderRadius: 6,
    marginBottom: 18,
  },
  contact: {
    borderTopWidth: 1,
    borderTopColor: "#dfe5dc",
    paddingTop: 15,
    marginTop: 10,
    fontSize: 10,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 44,
    right: 44,
    fontFamily: "CardioNoto",
    fontSize: 9,
    color: "#68786e",
    textAlign: "center",
  },
});
export async function renderVisitPdf(report: LocalizedReport) {
  const he = report.language === "he",
    direction = he ? "rtl" : "ltr";
  const textStyle = {
    fontFamily: he
      ? ["CardioHebrew", "CardioNoto"]
      : ["CardioNoto", "CardioHebrew"],
    direction,
    textAlign: he ? "right" : "left",
  } as const;
  const labels = report.labels;
  const display = (text: string) =>
    he
      ? text.replace(
          /[A-Za-z0-9][A-Za-z0-9 .:/@_+%—-]*/g,
          (run) =>
            "\u200e" +
            run.trimEnd() +
            "\u200e" +
            run.slice(run.trimEnd().length),
        )
      : text;
  const element = (
    <Document
      title={report.report_title}
      author={report.clinician_name}
      subject="Visit summary"
      language={report.language}
      creationDate={new Date(report.visit_date + "T12:00:00Z")}
      modificationDate={new Date(report.visit_date + "T12:00:00Z")}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>cardioahead.</Text>
          <Text style={[styles.title, textStyle]}>{report.report_title}</Text>
          <Text style={[styles.identity, textStyle]}>
            {display(labels.patient + ": " + report.patient_name)}
          </Text>
          {report.patient_reference && (
            <Text style={[styles.identity, textStyle]}>
              {display(labels.reference + ": " + report.patient_reference)}
            </Text>
          )}
          <Text style={[styles.identity, textStyle]}>
            {display(labels.visit_date + ": " + report.visit_date)}
          </Text>
          <Text style={[styles.identity, textStyle]}>
            {display(labels.clinician + ": " + report.clinician_name)}
          </Text>
          <Text style={[styles.identity, textStyle]}>
            {display(report.clinic_name)}
          </Text>
        </View>
        {report.sections.map((s) => (
          <View style={styles.section} key={s.key} minPresenceAhead={70}>
            <Text style={[styles.sectionTitle, textStyle]}>{s.title}</Text>
            <Text style={[styles.body, textStyle]} orphans={3} widows={3}>
              {display(s.text)}
            </Text>
          </View>
        ))}
        <View style={styles.goals} minPresenceAhead={100}>
          <Text style={[styles.sectionTitle, textStyle]}>
            {report.next_steps_title}
          </Text>
          {report.next_steps.map((step, i) => (
            <Text key={i} style={[styles.body, textStyle]}>
              {display("• " + step)}
            </Text>
          ))}
        </View>
        <View style={styles.contact}>
          <Text style={[styles.sectionTitle, textStyle]}>{labels.contact}</Text>
          <Text style={[styles.body, textStyle]}>
            {display(report.clinic_contact)}
          </Text>
        </View>
        <Text style={styles.footer} fixed>
          CardioAhead
        </Text>
      </Page>
    </Document>
  );
  return Buffer.from(await renderToBuffer(element));
}
