import { medicalSourceById } from "@/lib/medical-import/store";
import { json } from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import { requireStaff, failure, PortalError } from "@/lib/portal/security";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staff = await requireStaff();
    const { id } = await params;
    const store = getStore();
    const document = await store.document(id);
    if (!document) {
      const source = await medicalSourceById(id);
      if (!source) throw new PortalError(404, "NOT_FOUND", "המקור לא נמצא.");
      const card = await store.appointment(source.appointment_id);
      if (!card || card.deletion_requested_at)
        throw new PortalError(410, "CARD_DELETING", "התיק נמצא בתהליך מחיקה.");
      return json({ kind: "medical_record", record: source.record });
    }
    const a = await store.appointment(document.appointment_id);
    if (!a || a.deletion_requested_at)
      throw new PortalError(
        410,
        "CARD_DELETING",
        "התיק נמצא בתהליך מחיקה ואינו זמין לגישה.",
      );
    const bytes = await store.readDocument(document);
    await store.audit({
      event: "document_opened",
      actor_id: staff.id,
      appointment_id: document.appointment_id,
      document_id: document.id,
    });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "inline; filename=medical-document.pdf; filename*=UTF-8''" +
          encodeURIComponent(document.filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
