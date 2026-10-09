import { after } from "next/server";
import { runAnalysis } from "@/lib/clinical/engine";
import { clinicalStore } from "@/lib/clinical/store";
import { getStore } from "@/lib/portal/store";
import {
  requirePatient,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await requirePatient();
    const input = await body(request);
    if (input.confirmed !== true)
      throw new PortalError(
        400,
        "CONFIRMATION_REQUIRED",
        "אשרו שהמסמכים שייכים לתיק הבדיקה לפני השליחה.",
      );
    if (
      a.status !== "submitted" &&
      a.status !== "reviewed" &&
      !(await getStore().submit(a.id))
    )
      throw new PortalError(
        409,
        "NO_DOCUMENTS",
        "יש לצרף לפחות מסמך אחד לפני השליחה.",
      );
    // Persist the work before responding. A processing outage never loses uploads.
    try {
      await clinicalStore().queue(a.id);
    } catch {
      console.error("Analysis queue is not connected");
    }
    after(async () => {
      try {
        await runAnalysis(a.id);
      } catch {
        console.error("Analysis job could not start");
      }
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
