import { getStore } from "@/lib/portal/store";
import {
  requirePatient,
  json,
  failure,
  appointmentView,
  sameOrigin,
  clearSession,
} from "@/lib/portal/security";
export async function GET() {
  try {
    const a = await requirePatient();
    return json({
      appointment: appointmentView(a, await getStore().documents(a.id)),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    await clearSession("patient");
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
