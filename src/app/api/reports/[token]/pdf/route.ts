import { requireReport } from "@/lib/visit/access";
import { hash, failure, PortalError } from "@/lib/portal/security";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { approval } = await requireReport((await params).token),
      bytes = Buffer.from(approval.pdf_base64, "base64");
    if (hash(bytes) !== approval.pdf_sha256)
      throw new PortalError(503, "PDF_UNAVAILABLE", "קובץ הדוח אינו זמין כעת.");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="cardioahead-visit-summary.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
