import { getStore } from "@/lib/portal/store";
import {
  requirePatient,
  sameOrigin,
  body,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
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
    if (a.status === "submitted" || a.status === "reviewed")
      return json({ ok: true });
    if (!(await getStore().submit(a.id)))
      throw new PortalError(
        409,
        "NO_DOCUMENTS",
        "יש לצרף לפחות מסמך אחד לפני השליחה.",
      );
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
