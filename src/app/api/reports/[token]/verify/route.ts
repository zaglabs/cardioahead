import { cookies } from "next/headers";
import {
  availableReport,
  reportCookie,
  reportChallengeCookie,
} from "@/lib/visit/access";
import { visitStore } from "@/lib/visit/store";
import { reportsEmailConfigured } from "@/lib/visit/delivery";
import { sendLoginCode } from "@/lib/portal/resend";
import { localTestMode } from "@/lib/portal/config";
import {
  sameOrigin,
  body,
  newPin,
  randomToken,
  hash,
  pinDigest,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    sameOrigin(request);
    const input = await body(request),
      { token } = await params,
      jar = await cookies(),
      store = visitStore();
    if (input.action === "logout") {
      const current = jar.get(reportCookie)?.value;
      if (current) await store.logout(hash(current));
      jar.delete(reportCookie);
      jar.delete(reportChallengeCookie);
      return json({ ok: true });
    }
    const { delivery, approval } = await availableReport(token);
    if (input.action === "request") {
      if (!reportsEmailConfigured())
        throw new PortalError(
          503,
          "REPORT_EMAIL_SETUP",
          "יש לחבר את שירות הדוא״ל לפני שליחת קוד אימות.",
        );
      const challengeToken = randomToken(),
        id = hash(challengeToken),
        code = newPin();
      const ip = process.env.VERCEL
        ? request.headers
            .get("x-vercel-forwarded-for")
            ?.split(",")[0]
            ?.trim() || "unknown"
        : "local";
      if (
        !(await store.reserveCode({
          id,
          delivery_id: delivery.id,
          code_digest: pinDigest("report:" + id + ":" + delivery.id, code),
          ip_hash: pinDigest("report-ip", ip),
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
          attempts: 0,
          delivered: false,
          consumed: false,
        }))
      )
        throw new PortalError(
          429,
          "TRY_LATER",
          "בקשות רבות מדי. המתינו דקה ונסו שוב.",
        );
      try {
        await sendLoginCode(
          approval.recipient,
          code,
          "report-" + id,
          approval.language,
        );
        await store.codeDelivery(id, true);
      } catch (e) {
        await store.codeDelivery(id, false);
        throw e;
      }
      jar.set(reportChallengeCookie, challengeToken, {
        httpOnly: true,
        secure: !localTestMode(),
        sameSite: "strict",
        path: "/",
        maxAge: 600,
      });
      return json({ ok: true, message: "Code sent" });
    }
    if (
      input.action !== "verify" ||
      typeof input.code !== "string" ||
      !/^\d{6}$/.test(input.code)
    )
      throw new PortalError(400, "BAD_REQUEST", "הזינו קוד בן שש ספרות.");
    const challenge = jar.get(reportChallengeCookie)?.value;
    if (!challenge)
      throw new PortalError(
        401,
        "INVALID_CODE",
        "הקוד אינו תקין או שפג תוקפו. בקשו קוד חדש.",
      );
    const session = randomToken(),
      id = hash(challenge);
    if (
      !(await store.verifyCode(
        id,
        delivery.id,
        pinDigest("report:" + id + ":" + delivery.id, input.code),
        hash(session),
      ))
    )
      throw new PortalError(
        401,
        "INVALID_CODE",
        "הקוד אינו תקין או שפג תוקפו. בקשו קוד חדש.",
      );
    jar.set(reportCookie, session, {
      httpOnly: true,
      secure: !localTestMode(),
      sameSite: "strict",
      path: "/",
      maxAge: 7200,
    });
    jar.delete(reportChallengeCookie);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
