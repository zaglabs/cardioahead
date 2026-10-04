import "server-only";
import { localTestMode } from "./config";
import { PortalError } from "./security";
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
) {
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
        subject: "קוד הכניסה שלכם ל־CardioAhead",
        text:
          "קוד הכניסה שלכם הוא: " +
          code +
          "\n\nהקוד תקף ל־10 דקות וניתן לשימוש פעם אחת בלבד. אל תשתפו את הקוד עם אחרים. אם לא ביקשתם להיכנס, אפשר להתעלם מההודעה.\n\nCardioAhead | מרפאת פרופ׳ אלעד מאור",
        html:
          '<div dir="rtl" lang="he" style="font-family:Arial,sans-serif;font-size:18px;line-height:1.7;color:#183b3b"><h2>כניסה ל־CardioAhead</h2><p>קוד הכניסה שלכם:</p><p dir="ltr" style="font-size:34px;letter-spacing:8px;font-weight:bold">' +
          code +
          "</p><p>הקוד תקף ל־10 דקות ולשימוש אחד. אל תשתפו אותו עם אחרים.</p><p>אם לא ביקשתם להיכנס, אפשר להתעלם מההודעה.</p><p>מרפאת פרופ׳ אלעד מאור</p></div>",
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
