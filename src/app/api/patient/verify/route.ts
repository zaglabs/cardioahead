import { getStore } from "@/lib/portal/store";
import {
  sameOrigin,
  ensureConfigured,
  body,
  text,
  json,
  failure,
  hash,
  pinDigest,
  randomToken,
  setSession,
  PortalError,
} from "@/lib/portal/security";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    ensureConfigured();
    const input = await body(request);
    const invitation = text(input.token, 64);
    const code = text(input.code, 6);
    if (!/^[A-Za-z0-9_-]{43}$/.test(invitation) || !/^\d{6}$/.test(code))
      throw new PortalError(
        401,
        "INVALID_INVITATION",
        "הקישור או הקוד אינם תקינים. בדקו את הפרטים שקיבלתם מהמרפאה.",
      );
    const token = randomToken();
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const accepted = await getStore().verifyPatient(
      hash(invitation),
      pinDigest(hash(invitation), code),
      {
        session_hash: hash(token),
        kind: "patient",
        staff_id: null,
        appointment_id: null,
        expires_at: expires.toISOString(),
      },
    );
    if (!accepted)
      throw new PortalError(
        401,
        "INVALID_INVITATION",
        "הקישור או הקוד אינם תקינים, פגו או נחסמו. פנו למרפאה לקבלת גישה חדשה.",
      );
    await setSession("patient", token, expires);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
