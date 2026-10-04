import {
  randomToken,
  hash,
  equal,
  sameOrigin,
  body,
  text,
  json,
  failure,
  ensureConfigured,
  setSession,
  clearSession,
  PortalError,
} from "@/lib/portal/security";
import { getStore, supabaseAuth } from "@/lib/portal/store";
import { localTestMode } from "@/lib/portal/config";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    ensureConfigured();
    const input = await body(request);
    if (input.action === "logout") {
      await clearSession("staff");
      return json({ ok: true });
    }
    const email = text(input.email, 254).toLowerCase();
    const staff = await getStore().staffByEmail(email);
    if (input.action === "request") {
      if (staff && !localTestMode()) {
        const { error } = await supabaseAuth().auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (error)
          throw new PortalError(
            429,
            "TRY_LATER",
            "לא ניתן לשלוח קוד כרגע. נסו שוב בעוד דקה.",
          );
      }
      return json({
        ok: true,
        message: "אם הכתובת רשומה לצוות המרפאה, יישלח אליה קוד כניסה.",
      });
    }
    if (input.action !== "verify")
      throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    const code = text(input.code, 128);
    let authenticated = false;
    if (localTestMode())
      authenticated = Boolean(
        staff && equal(code, process.env.CARDIOAHEAD_LOCAL_PASSWORD!),
      );
    else if (staff) {
      const { data, error } = await supabaseAuth().auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      authenticated =
        !error &&
        data.user?.id === staff.id &&
        data.user.email?.toLowerCase() === staff.email;
    }
    if (!staff || !authenticated)
      throw new PortalError(
        401,
        "INVALID_CODE",
        "הקוד לא תקין או שהחשבון אינו מורשה.",
      );
    const token = randomToken();
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await getStore().createSession({
      session_hash: hash(token),
      kind: "staff",
      staff_id: staff.id,
      appointment_id: null,
      expires_at: expires.toISOString(),
    });
    await getStore().audit({ event: "staff_signed_in", actor_id: staff.id });
    await setSession("staff", token, expires);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
