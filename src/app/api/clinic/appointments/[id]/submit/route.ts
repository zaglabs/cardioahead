import { after } from "next/server";
import { getStore } from "@/lib/portal/store";
import { clinicalStore } from "@/lib/clinical/store";
import { runAnalysis } from "@/lib/clinical/engine";
import {
  requireStaff,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const staff = await requireStaff(),
      { id } = await params,
      input = await body(request);
    if (input.confirmed !== true)
      throw new PortalError(
        400,
        "CONFIRMATION_REQUIRED",
        "אשרו שהמסמכים שייכים לתיק הבדיקה לפני השליחה.",
      );
    const appointment = await getStore().appointment(id);
    if (appointment?.deletion_requested_at)
      throw new PortalError(
        410,
        "CARD_DELETING",
        "התיק נמצא בתהליך מחיקה ואינו זמין לגישה.",
      );
    if (!appointment)
      throw new PortalError(404, "NOT_FOUND", "הביקור לא נמצא.");
    if (
      appointment.status === "invited" &&
      !(await getStore().submitClinic(id, staff.id))
    )
      throw new PortalError(
        409,
        "NO_DOCUMENTS",
        "יש לצרף לפחות מסמך אחד לפני השליחה.",
      );
    try {
      await clinicalStore().queue(id);
    } catch {
      console.error("Analysis queue is not connected");
    }
    after(async () => {
      try {
        await runAnalysis(id);
      } catch {
        console.error("Analysis job could not start");
      }
    });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
