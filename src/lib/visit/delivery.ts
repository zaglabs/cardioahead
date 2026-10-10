import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { hash, randomToken, PortalError } from "@/lib/portal/security";
import { visitStore } from "./store";
import type { Approval, Delivery } from "./types";
import { localTestMode, secret } from "@/lib/portal/config";
import {
  sendStoredReportNotice,
  getReportEmailEvent,
} from "@/lib/portal/resend";
const key = () =>
  createHash("sha256")
    .update("cardioahead-report-link-v1:" + secret())
    .digest();
export function encryptReportToken(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function decryptReportToken(value: string) {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export function reportsEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
export function secureReportUrl(token: string, language: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (localTestMode() ? "http://127.0.0.1:3100" : "https://www.cardioahead.com");
  const site = new URL(base);
  if (
    site.protocol !== "https:" &&
    !(localTestMode() && site.hostname === "127.0.0.1")
  )
    throw new Error("INVALID_REPORT_SITE");
  return site.origin + "/report/" + token + "?lang=" + language;
}
export function reportNotice(
  recipient: string,
  url: string,
  language: string,
): Delivery["notice_payload"] {
  return {
    from: process.env.RESEND_FROM_EMAIL!,
    to: [recipient],
    subject:
      language === "he"
        ? "מסמך מאובטח זמין עבורך"
        : "A secure document is available",
    text:
      language === "he"
        ? "מסמך מאובטח זמין עבורך במערכת CardioAhead.\n\nפתחו את הקישור ואמתו גישה באמצעות קוד שיישלח לדוא״ל שלכם:\n" +
          url +
          "\n\nהקישור תקף לשבעה ימים. אם ההודעה אינה מיועדת לכם, אפשר להתעלם ממנה."
        : "A secure document is available in CardioAhead.\n\nOpen the link and verify access with a code sent to your email:\n" +
          url +
          "\n\nThis link expires in seven days. If this message is not intended for you, you can ignore it.",
  };
}
export async function sendApprovedReport(
  actor: string,
  pid: string,
  approval: Approval,
  recipient: string,
  reissue = false,
  previousDeliveryId?: string,
) {
  if (!reportsEmailConfigured())
    throw new PortalError(
      503,
      "REPORT_EMAIL_SETUP",
      "יש לחבר את שירות הדוא״ל לפני שליחת דוח למטופל.",
    );
  const token = randomToken(),
    attempt = randomUUID();
  const claimed = (await visitStore().mutate(actor, pid, "claim_send", {
    approval_id: approval.id,
    confirmed_recipient: recipient,
    content_hash: approval.content_hash,
    delivery_id: randomUUID(),
    attempt_id: attempt,
    reissue,
    expected_delivery_id: previousDeliveryId || null,
    token_hash: hash(token),
    token_encrypted: encryptReportToken(token),
    notice_payload: {
      ...reportNotice(approval.recipient, "{{secure_link}}", approval.language),
      link_origin: new URL(secureReportUrl(token, approval.language)).origin,
    },
  })) as { delivery: Delivery; send: boolean };
  if (!claimed.send) return { delivery: claimed.delivery, reused: true };
  try {
    const notice = claimed.delivery.notice_payload;
    const link =
      (notice.link_origin ||
        new URL(secureReportUrl(token, approval.language)).origin) +
      "/report/" +
      decryptReportToken(claimed.delivery.token_encrypted) +
      "?lang=" +
      claimed.delivery.language;
    const providerId = await sendStoredReportNotice(
      {
        from: notice.from,
        to: notice.to,
        subject: notice.subject,
        text: notice.text.replace("{{secure_link}}", link),
      },
      claimed.delivery.id,
    );
    if (
      !(await visitStore().finishSend(
        claimed.delivery.id,
        attempt,
        "accepted",
        providerId,
        null,
      ))
    )
      throw new Error("SEND_STATE_CHANGED");
    return {
      delivery: {
        ...claimed.delivery,
        status: "accepted",
        provider_id: providerId,
        accepted_at: new Date().toISOString(),
      },
      reused: false,
    };
  } catch (e) {
    const code = e instanceof PortalError ? e.code : "SEND_UNCONFIRMED";
    const status = code === "REPORT_EMAIL_REJECTED" ? "failed" : "unknown";
    await visitStore().finishSend(
      claimed.delivery.id,
      attempt,
      status,
      null,
      code,
    );
    throw new PortalError(
      503,
      "REPORT_SEND_FAILED",
      "שליחת ההודעה לא אושרה. האישור לגרסה זו נשמר; אפשר לנסות שוב באופן מבוקר.",
    );
  }
}
export async function refreshDeliveryStatus(delivery: Delivery) {
  if (!delivery.provider_id) return;
  const event = await getReportEmailEvent(delivery.provider_id);
  const status =
    event === "delivered" || event === "opened" || event === "clicked"
      ? "delivered"
      : ["bounced", "failed", "suppressed", "complained", "canceled"].includes(
            event,
          )
        ? "bounced"
        : "accepted";
  await visitStore().event(delivery.id, event, status);
}
