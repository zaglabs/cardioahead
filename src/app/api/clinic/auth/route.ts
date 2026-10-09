import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/catalog";
import { cookies } from "next/headers";
import {
  randomToken,
  newPin,
  hash,
  pinDigest,
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
import { authConfigured, localTestMode } from "@/lib/portal/config";
import { authStore } from "@/lib/portal/auth-store";
import { sendLoginCode } from "@/lib/portal/resend";
const challengeCookie = "cardioahead_otp";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    ensureConfigured();
    const input = await body(request);
    const language = await getLanguage();
    const jar = await cookies();
    if (input.action === "logout") {
      await clearSession("staff");
      jar.delete(challengeCookie);
      return json({ ok: true });
    }
    if (!authConfigured())
      throw new PortalError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "שירות שליחת קודי הכניסה עדיין אינו מחובר.",
      );
    const email = text(input.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new PortalError(400, "BAD_EMAIL", "הזינו כתובת דוא״ל תקינה.");
    const store = authStore();
    if (input.action === "request") {
      const token = randomToken();
      const id = hash(token);
      const code = newPin();
      // The platform header is trusted only when served by Vercel; no raw IP is stored.
      const ip = process.env.VERCEL
        ? request.headers
            .get("x-vercel-forwarded-for")
            ?.split(",")[0]
            ?.trim() || "unknown"
        : "local";
      const reserved = await store.reserve({
        id,
        email,
        code_digest: pinDigest("staff:" + id + ":" + email, code),
        ip_hash: pinDigest("staff-ip", ip),
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 600000).toISOString(),
        attempts: 0,
        delivered: false,
        consumed: false,
      });
      if (!reserved)
        throw new PortalError(
          429,
          "TRY_LATER",
          "בקשות רבות מדי. המתינו דקה ונסו שוב; אם הבעיה נמשכת, נסו מאוחר יותר.",
        );
      try {
        await sendLoginCode(email, code, id, language);
        await store.delivery(id, true);
      } catch (error) {
        await store.delivery(id, false);
        throw error;
      }
      jar.set(challengeCookie, token, {
        httpOnly: true,
        secure: !localTestMode(),
        sameSite: "strict",
        path: "/",
        maxAge: 600,
      });
      return json({
        ok: true,
        retryAfter: 60,
        message: translate("קוד כניסה נשלח לכתובת שהזנתם.", language),
      });
    }
    if (input.action !== "verify")
      throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
    const code = text(input.code, 6);
    const token = jar.get(challengeCookie)?.value;
    if (!/^\d{6}$/.test(code) || !token)
      throw new PortalError(
        401,
        "INVALID_CODE",
        "הקוד אינו תקין או שפג תוקפו. בקשו קוד חדש.",
      );
    const id = hash(token);
    const sessionToken = randomToken();
    const staff = await store.verify(
      id,
      email,
      pinDigest("staff:" + id + ":" + email, code),
      hash(sessionToken),
    );
    if (!staff)
      throw new PortalError(
        401,
        "INVALID_CODE",
        "הקוד אינו תקין, פג תוקפו או שהגישה לחשבון אינה מאושרת.",
      );
    await clearSession("staff");
    await setSession("staff", sessionToken, new Date(Date.now() + 7200000));
    jar.delete(challengeCookie);
    return json({ ok: true, status: staff.status });
  } catch (error) {
    return failure(error);
  }
}
