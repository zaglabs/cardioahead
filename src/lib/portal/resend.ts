import "server-only";
import { localTestMode } from "./config";
import { PortalError } from "./security";
import type { Language } from "@/lib/i18n/catalog";
// A loopback endpoint is allowed only for automated local integration tests.
function endpoint() {
  if (localTestMode() && process.env.CARDIOAHEAD_TEST_RESEND_URL) {
    const url = new URL(process.env.CARDIOAHEAD_TEST_RESEND_URL);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
      throw new Error("INVALID_TEST_EMAIL_ENDPOINT");
    return url.toString();
  }
  return "https://api.resend.com/emails";
}
export async function sendLoginCode(
  email: string,
  code: string,
  challengeId: string,
  language: Language,
) {
  const en = language === "en";
  const title = en ? "Sign in to CardioAhead" : "כניסה ל־CardioAhead";
  const label = en ? "Your sign-in code:" : "קוד הכניסה שלכם:";
  const expiry = en
    ? "This code is valid for 10 minutes and one use only. Do not share it with anyone."
    : "הקוד תקף ל־10 דקות ולשימוש אחד. אל תשתפו אותו עם אחרים.";
  const unsolicited = en
    ? "If you did not request this code, you can ignore this email."
    : "אם לא ביקשתם להיכנס, אפשר להתעלם מההודעה.";
  const clinic = en ? "Prof. Elad Maor’s clinic" : "מרפאת פרופ׳ אלעד מאור";
  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY!,
        "Content-Type": "application/json",
        "Idempotency-Key": "clinic-otp-" + challengeId,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [email],
        subject: en
          ? "Your CardioAhead sign-in code"
          : "קוד הכניסה שלכם ל־CardioAhead",
        text:
          label +
          " " +
          code +
          "\n\n" +
          expiry +
          "\n" +
          unsolicited +
          "\n\nCardioAhead | " +
          clinic,
        html:
          '<div dir="' +
          (en ? "ltr" : "rtl") +
          '" lang="' +
          language +
          '" style="font-family:Arial,sans-serif;font-size:18px;line-height:1.7;color:#183b3b"><h2>' +
          title +
          "</h2><p>" +
          label +
          '</p><p dir="ltr" style="font-size:34px;letter-spacing:8px;font-weight:bold">' +
          code +
          "</p><p>" +
          expiry +
          "</p><p>" +
          unsolicited +
          "</p><p>" +
          clinic +
          "</p></div>",
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
    const result: { id?: unknown } = await response.json();
    if (typeof result.id !== "string") throw new Error("EMAIL_DELIVERY_FAILED");
  } catch {
    // Never log provider responses, API keys, email addresses or OTPs.
    throw new PortalError(
      503,
      "EMAIL_UNAVAILABLE",
      "לא הצלחנו לשלוח את הקוד. נסו שוב בעוד דקה.",
    );
  }
}

export async function sendStoredReportNotice(
  payload: { from: string; to: string[]; subject: string; text: string },
  deliveryId: string,
) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
    throw new PortalError(
      503,
      "REPORT_EMAIL_SETUP",
      "יש לחבר את שירות הדוא״ל לפני שליחת דוח למטופל.",
    );
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-report-" + deliveryId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new PortalError(
      503,
      "REPORT_EMAIL_UNCONFIRMED",
      "שליחת ההודעה לא אושרה. האישור לגרסה זו נשמר; אפשר לנסות שוב באופן מבוקר.",
    );
  }
  if (!response.ok)
    throw new PortalError(
      503,
      "REPORT_EMAIL_REJECTED",
      "שירות הדוא״ל לא קיבל את ההודעה.",
    );
  const result = await response.json().catch(() => null);
  if (typeof result?.id !== "string")
    throw new PortalError(
      503,
      "REPORT_EMAIL_UNCONFIRMED",
      "לא ניתן לאמת את קבלת ההודעה בשירות הדוא״ל.",
    );
  return result.id as string;
}
export async function getReportEmailEvent(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("INVALID_PROVIDER_ID");
  const url = new URL(endpoint());
  url.pathname = url.pathname.replace(/\/$/, "") + "/" + id;
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new PortalError(
      503,
      "REPORT_STATUS_UNAVAILABLE",
      "לא ניתן לבדוק כעת את מצב המסירה בשירות הדוא״ל.",
    );
  const value = await response.json();
  if (typeof value.last_event !== "string")
    throw new PortalError(
      503,
      "REPORT_STATUS_UNAVAILABLE",
      "לא ניתן לבדוק כעת את מצב המסירה בשירות הדוא״ל.",
    );
  return value.last_event as string;
}
