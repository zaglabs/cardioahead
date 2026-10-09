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
