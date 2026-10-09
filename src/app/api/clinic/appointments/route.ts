import { randomUUID } from "node:crypto";
import { getStore } from "@/lib/portal/store";
import {
  requireStaff,
  sameOrigin,
  body,
  text,
  json,
  failure,
  randomToken,
  newPin,
  hash,
  pinDigest,
  appointmentView,
  PortalError,
} from "@/lib/portal/security";
export async function GET() {
  try {
    await requireStaff();
    const store = getStore();
    const appointments = await store.appointments();
    return json({
      appointments: await Promise.all(
        appointments.map(async (a) =>
          appointmentView(a, await store.documents(a.id)),
        ),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const staff = await requireStaff();
    const input = await body(request);
    const label = text(input.patientLabel, 100);
    const language = input.language ?? "he";
    if (language !== "he" && language !== "en")
      throw new PortalError(400, "BAD_LANGUAGE", "שפה לא תקינה.");
    const suppliedDate = input.appointmentAt;
    const date =
      typeof suppliedDate === "string" && suppliedDate
        ? new Date(suppliedDate)
        : null;
    if (
      date &&
      (!Number.isFinite(date.getTime()) ||
        date.getTime() < Date.now() - 24 * 60 * 60 * 1000)
    )
      throw new PortalError(400, "INVALID_DATE", "בחרו מועד ביקור תקין.");
    const token = randomToken();
    const code = newPin();
    const tokenHash = hash(token);
    const appointment = {
      id: randomUUID(),
      patient_label: label,
      appointment_at: date?.toISOString() || null,
      status: "invited" as const,
      token_hash: tokenHash,
      pin_digest: pinDigest(tokenHash, code),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      revoked_at: null,
      failed_attempts: 0,
      created_by: staff.id,
      created_at: new Date().toISOString(),
      submitted_at: null,
    };
    await getStore().createAppointment(appointment);
    return json(
      {
        appointment: appointmentView(appointment, []),
        invitationUrl:
          (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin) +
          "/invite/" +
          token +
          "?lang=" +
          language,
        code,
      },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
