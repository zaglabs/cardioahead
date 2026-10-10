import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { configured, localTestMode, secret } from "./config";
import { getStore } from "./store";
import { isAdmin } from "./staff-access";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/catalog";
import type {
  AppointmentView,
  DocumentView,
  Appointment,
  DocumentRecord,
} from "./types";

export class PortalError extends Error {
  constructor(
    public status: number,
    public code: string,
    public message: string,
  ) {
    super(message);
  }
}
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const pinDigest = (tokenHash: string, pin: string) =>
  createHmac("sha256", secret())
    .update(tokenHash + ":" + pin)
    .digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export const newPin = () => String(randomInt(0, 1000000)).padStart(6, "0");
export function equal(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function ensureConfigured() {
  if (!configured())
    throw new PortalError(
      503,
      "NOT_CONFIGURED",
      "מערכת האחסון והכניסה עדיין אינה מחוברת.",
    );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (localTestMode()
      ? new URL(request.url).origin
      : "https://www.cardioahead.com");
  if (!origin || !expected || origin !== new URL(expected).origin)
    throw new PortalError(
      403,
      "ORIGIN_DENIED",
      "הבקשה לא אושרה. רעננו את העמוד ונסו שוב.",
    );
}
export async function body(request: Request) {
  const text = await request.text();
  if (Buffer.byteLength(text) > 8192)
    throw new PortalError(413, "TOO_LARGE", "הבקשה גדולה מדי.");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new PortalError(400, "BAD_REQUEST", "בקשה לא תקינה.");
  }
}
export function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new PortalError(400, "BAD_REQUEST", "בדקו את הפרטים שהזנתם.");
  return value.trim();
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function failure(error: unknown) {
  const language = await getLanguage();
  const response =
    error instanceof PortalError
      ? json(
          { error: error.code, message: translate(error.message, language) },
          error.status,
        )
      : json(
          {
            error: "SERVICE_ERROR",
            message: translate(
              "לא הצלחנו להשלים את הפעולה. נסו שוב בעוד רגע.",
              language,
            ),
          },
          500,
        );
  if (!(error instanceof PortalError))
    console.error(
      "Portal operation failed",
      error instanceof Error ? error.name : "UnknownError",
    );
  response.headers.set("Content-Language", language);
  return response;
}

const cookieName = (kind: "staff" | "patient") =>
  kind === "staff" ? "cardioahead_clinic" : "cardioahead_patient";
export async function setSession(
  kind: "staff" | "patient",
  token: string,
  expires: Date,
) {
  (await cookies()).set(cookieName(kind), token, {
    httpOnly: true,
    secure: !localTestMode(),
    sameSite: "strict",
    path: "/",
    expires,
  });
}
export async function clearSession(kind: "staff" | "patient") {
  const jar = await cookies();
  const token = jar.get(cookieName(kind))?.value;
  if (token && configured()) await getStore().deleteSession(hash(token));
  jar.delete(cookieName(kind));
}
export async function session(kind: "staff" | "patient") {
  ensureConfigured();
  const token = (await cookies()).get(cookieName(kind))?.value;
  if (!token) return null;
  const record = await getStore().session(hash(token));
  return record &&
    record.kind === kind &&
    new Date(record.expires_at).getTime() > Date.now()
    ? record
    : null;
}
export async function requireIdentity() {
  const current = await session("staff");
  const staff = current?.staff_id
    ? await getStore().staff(current.staff_id)
    : null;
  if (!staff || staff.status === "suspended" || staff.status === "rejected")
    throw new PortalError(
      401,
      "LOGIN_REQUIRED",
      "יש להיכנס עם חשבון צוות המרפאה.",
    );
  return staff;
}
export async function requireStaff() {
  const staff = await requireIdentity();
  if (staff.status !== "active")
    throw new PortalError(
      403,
      "APPROVAL_REQUIRED",
      "החשבון ממתין לאישור מנהל המערכת.",
    );
  return staff;
}
export async function requireAdmin() {
  const staff = await requireStaff();
  if (!isAdmin(staff))
    throw new PortalError(
      403,
      "ADMIN_REQUIRED",
      "הפעולה זמינה למנהל המערכת בלבד.",
    );
  return staff;
}
export async function requirePatient() {
  const current = await session("patient");
  const appointment = current?.appointment_id
    ? await getStore().appointment(current.appointment_id)
    : null;
  if (
    !appointment ||
    appointment.revoked_at ||
    appointment.intake_mode === "clinic" ||
    new Date(appointment.expires_at).getTime() <= Date.now()
  )
    throw new PortalError(
      401,
      "INVITATION_REQUIRED",
      "הגישה פגה או בוטלה. בקשו מהמרפאה קישור חדש.",
    );
  return appointment;
}
export function documentView(d: DocumentRecord): DocumentView {
  return {
    id: d.id,
    filename: d.filename,
    bytes: d.bytes,
    created_at: d.created_at,
  };
}
export function appointmentView(
  a: Appointment,
  documents: DocumentRecord[],
): AppointmentView {
  return {
    id: a.id,
    patient_label: a.patient_label,
    intake_mode: a.intake_mode || "invitation",
    appointment_at: a.appointment_at,
    status: a.status,
    expires_at: a.expires_at,
    revoked_at: a.revoked_at,
    created_at: a.created_at,
    submitted_at: a.submitted_at,
    documents: documents.map(documentView),
  };
}
