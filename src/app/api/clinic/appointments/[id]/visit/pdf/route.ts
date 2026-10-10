import { visitAccess, uuid } from "@/lib/visit/service";
import { visitStore } from "@/lib/visit/store";
import {
  localizedReport,
  validateReport,
  validDate,
} from "@/lib/visit/content";
import { renderVisitPdf } from "@/lib/visit/pdf";
import { failure, PortalError, hash } from "@/lib/portal/security";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await visitAccess(id);
    const url = new URL(request.url),
      approvalId = url.searchParams.get("approval"),
      store = visitStore();
    let bytes: Buffer;
    if (approvalId) {
      const approval = await store.approval(uuid(approvalId)!);
      if (!approval || approval.appointment_id !== id)
        throw new PortalError(404, "NOT_FOUND", "הדוח לא נמצא.");
      bytes = Buffer.from(approval.pdf_base64, "base64");
      if (hash(bytes) !== approval.pdf_sha256)
        throw new PortalError(
          503,
          "PDF_UNAVAILABLE",
          "קובץ הדוח אינו זמין כעת.",
        );
    } else {
      const version = await store.version(
        id,
        uuid(url.searchParams.get("version"))!,
      );
      if (!version || version.kind !== "summary")
        throw new PortalError(404, "NOT_FOUND", "הדוח לא נמצא.");
      const report = validateReport(version.data);
      if (!validDate(report.visit_date, true))
        throw new PortalError(
          400,
          "REPORT_DATE_REQUIRED",
          "הזינו תאריך ביקור לפני תצוגת PDF.",
        );
      bytes = await renderVisitPdf(
        localizedReport(
          report,
          url.searchParams.get("language") === "en" ? "en" : "he",
        ),
      );
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'inline; filename="cardioahead-visit-summary.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
