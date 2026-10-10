import "server-only";
import { cookies } from "next/headers";
import { hash, PortalError, ensureConfigured } from "@/lib/portal/security";
import { visitStore } from "./store";
import { getStore } from "@/lib/portal/store";
export const reportCookie = "cardioahead_report",
  reportChallengeCookie = "cardioahead_report_code";
export async function availableReport(token: string) {
  ensureConfigured();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new PortalError(
      410,
      "REPORT_LINK_UNAVAILABLE",
      "הקישור אינו זמין או שפג תוקפו. פנו למרפאה לקבלת קישור חדש.",
    );
  const store = visitStore(),
    delivery = await store.delivery(hash(token));
  if (
    !delivery ||
    delivery.revoked_at ||
    Date.parse(delivery.expires_at) <= Date.now() ||
    ["failed", "bounced"].includes(delivery.status)
  )
    throw new PortalError(
      410,
      "REPORT_LINK_UNAVAILABLE",
      "הקישור אינו זמין או שפג תוקפו. פנו למרפאה לקבלת קישור חדש.",
    );
  const appointment = await getStore().appointment(delivery.appointment_id);
  if (!appointment || appointment.deletion_requested_at)
    throw new PortalError(
      410,
      "REPORT_LINK_UNAVAILABLE",
      "הקישור אינו זמין או שפג תוקפו. פנו למרפאה לקבלת קישור חדש.",
    );
  const approval = await store.approval(delivery.approval_id);
  if (
    !approval ||
    approval.appointment_id !== delivery.appointment_id ||
    approval.recipient !== delivery.recipient
  )
    throw new PortalError(
      410,
      "REPORT_LINK_UNAVAILABLE",
      "הקישור אינו זמין או שפג תוקפו. פנו למרפאה לקבלת קישור חדש.",
    );
  return { delivery, approval };
}
export async function requireReport(token: string) {
  const access = await availableReport(token),
    cookie = (await cookies()).get(reportCookie)?.value;
  const session = cookie ? await visitStore().session(hash(cookie)) : null;
  if (
    !session ||
    session.delivery_id !== access.delivery.id ||
    Date.parse(session.expires_at) <= Date.now()
  )
    throw new PortalError(
      401,
      "REPORT_VERIFICATION_REQUIRED",
      "יש לאמת את הגישה באמצעות קוד שנשלח לדוא״ל.",
    );
  return access;
}
export async function reportIdentity(token: string) {
  const access = await availableReport(token);
  try {
    await requireReport(token);
    return {
      verified: true,
      language: access.approval.language,
      report: access.approval.snapshot,
    };
  } catch (e) {
    if (e instanceof PortalError && e.code === "REPORT_VERIFICATION_REQUIRED")
      return { verified: false, language: access.approval.language };
    throw e;
  }
}
