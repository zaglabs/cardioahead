import "server-only";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import fixtures from "@/lib/test-documents.json";
import { MAX_PDF_BYTES, MAX_DOCUMENTS } from "./config";
import { getStore } from "./store";
import { hash, documentView, PortalError } from "./security";
import type { Appointment } from "./types";
export async function uploadDocument(
  request: Request,
  appointment: Appointment,
  actor?: string,
) {
  if (appointment.deletion_requested_at)
    throw new PortalError(
      410,
      "CARD_DELETING",
      "התיק נמצא בתהליך מחיקה ואינו זמין לגישה.",
    );
  if (appointment.status !== "invited")
    throw new PortalError(
      409,
      "UPLOAD_CLOSED",
      "המסמכים כבר נשלחו לניתוח. להוספת מסמכים פתחו ביקור חדש.",
    );
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_PDF_BYTES + 65536)
    throw new PortalError(
      413,
      "FILE_TOO_LARGE",
      "כל קובץ יכול להיות בגודל של עד 4 MB.",
    );
  const data = await request.formData(),
    file = data.get("file");
  if (
    !(file instanceof File) ||
    !file.size ||
    file.size > MAX_PDF_BYTES ||
    !file.name.toLowerCase().endsWith(".pdf")
  )
    throw new PortalError(
      400,
      "INVALID_PDF",
      "בחרו קובץ PDF תקין בגודל של עד 4 MB.",
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new PortalError(400, "INVALID_PDF", "הקובץ אינו PDF תקין.");
  const digest = hash(bytes);
  // Staff uploads use exactly the same fictional-document whitelist as patient uploads.
  if (!fixtures.some((f) => f.sha256 === digest))
    throw new PortalError(
      400,
      "TEST_DOCUMENT_ONLY",
      "בשלב הבדיקות אפשר להעלות רק את מסמכי הבדיקה הפיקטיביים של CardioAhead.",
    );
  const pdf = await PDFDocument.load(bytes);
  if (pdf.getPageCount() < 1 || pdf.getPageCount() > 50)
    throw new PortalError(400, "INVALID_PDF", "קובץ PDF לא תקין.");
  const store = getStore(),
    existing = await store.documents(appointment.id);
  if (existing.some((d) => d.sha256 === digest))
    throw new PortalError(
      409,
      "DUPLICATE_DOCUMENT",
      "המסמך הזה כבר הועלה לביקור.",
    );
  if (existing.length >= MAX_DOCUMENTS)
    throw new PortalError(
      409,
      "DOCUMENT_LIMIT",
      "אפשר לצרף עד 10 מסמכים לביקור.",
    );
  const id = randomUUID();
  const record = {
    id,
    appointment_id: appointment.id,
    filename: file.name.replace(/[\r\n\u0000-\u001f\/\\]/g, "_").slice(0, 180),
    storage_path: appointment.id + "/" + id + ".pdf",
    sha256: digest,
    bytes: bytes.length,
    created_at: new Date().toISOString(),
  };
  if (actor) await store.saveClinicDocument(record, bytes, actor);
  else await store.saveDocument(record, bytes);
  return documentView(record);
}
