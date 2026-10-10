import "server-only";
import { randomUUID } from "node:crypto";
import { localTestMode } from "./config";
import { localTransaction } from "./local-store";
import { supabaseAdmin } from "./store";
import { OWNER_EMAIL, isAdmin } from "./staff-access";
import { deletionResult } from "./deletion-result";
import type { Staff, StaffStatus } from "./types";
export type OtpChallenge = {
  id: string;
  email: string;
  code_digest: string;
  ip_hash: string;
  created_at: string;
  expires_at: string;
  attempts: number;
  delivered: boolean;
  consumed: boolean;
};
const check = <T>(r: { data: T; error: unknown }) => {
  if (r.error) throw new Error("AUTH_STORAGE_FAILED");
  return r.data;
};
export function authStore() {
  if (localTestMode())
    return {
      reserve: (c: OtpChallenge) =>
        localTransaction((s) => {
          const recent = s.otps.filter(
            (v) => Date.parse(v.created_at) > Date.now() - 3600000,
          );
          if (
            recent.some(
              (v) =>
                v.email === c.email &&
                Date.parse(v.created_at) > Date.now() - 60000,
            ) ||
            recent.filter((v) => v.email === c.email).length >= 5 ||
            recent.filter((v) => v.ip_hash === c.ip_hash).length >= 30
          )
            return false;
          for (const v of s.otps) if (v.email === c.email) v.consumed = true;
          s.otps = recent;
          s.otps.push(c);
          return true;
        }),
      delivery: (id: string, delivered: boolean) =>
        localTransaction((s) => {
          const c = s.otps.find((v) => v.id === id);
          if (c) {
            c.delivered = delivered;
            if (!delivered) c.consumed = true;
          }
        }),
      verify: (
        id: string,
        email: string,
        digest: string,
        sessionHash: string,
      ) =>
        localTransaction((s) => {
          const c = s.otps.find((v) => v.id === id && v.email === email);
          if (
            !c ||
            c.consumed ||
            !c.delivered ||
            c.attempts >= 5 ||
            Date.parse(c.expires_at) <= Date.now()
          )
            return null;
          if (c.code_digest !== digest) {
            c.attempts++;
            return null;
          }
          c.consumed = true;
          let staff = s.staff.find((v) => v.email === email);
          if (!staff) {
            staff = {
              id: randomUUID(),
              email,
              role: "secretary",
              status: "pending",
              created_at: new Date().toISOString(),
            };
            s.staff.push(staff);
            s.audit.push({
              event: "staff_access_requested",
              actor_id: staff.id,
              at: new Date().toISOString(),
            });
          }
          if (staff.status === "suspended" || staff.status === "rejected")
            return null;
          s.sessions.push({
            session_hash: sessionHash,
            kind: "staff",
            staff_id: staff.id,
            appointment_id: null,
            expires_at: new Date(Date.now() + 7200000).toISOString(),
          });
          s.audit.push({
            event: "staff_signed_in",
            actor_id: staff.id,
            at: new Date().toISOString(),
          });
          return staff;
        }),
      deleteUser: (actor: string, id: string, email: string) =>
        localTransaction((s) => {
          if (!s.staff.some((v) => v.id === actor && isAdmin(v))) return false;
          const user = s.staff.find((v) => v.id === id && v.email === email);
          if (!user || user.email === OWNER_EMAIL) return false;
          s.staff = s.staff.filter((v) => v.id !== id);
          s.sessions = s.sessions.filter((v) => v.staff_id !== id);
          s.otps = s.otps.filter((v) => v.email !== email);
          for (const a of s.appointments)
            if (a.created_by === id) a.created_by = null;
          for (const a of s.analyses)
            if (a.reviewed_by === id) a.reviewed_by = null;
          for (const r of s.evidenceReviews) {
            if (r.created_by === id) r.created_by = null;
          }
          for (const a of s.presentations) {
            if (a.created_by === id) a.created_by = null;
            if (a.reviewed_by === id) a.reviewed_by = null;
          }
          s.audit.push({
            event: "staff_user_deleted",
            actor_id: actor,
            details: {
              target_user_id: id,
              target_email: email,
              previous_role: user.role,
            },
            at: new Date().toISOString(),
          });
          return true;
        }),
      users: () =>
        localTransaction((s) =>
          [...s.staff].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        ),
      updateUser: (
        actor: string,
        id: string,
        status: StaffStatus,
        role: "secretary" | "professor",
      ) =>
        localTransaction((s) => {
          if (!s.staff.some((v) => v.id === actor && isAdmin(v))) return false;
          const staff = s.staff.find((v) => v.id === id);
          if (!staff || staff.email === OWNER_EMAIL) return false;
          staff.status = status;
          staff.role = role;
          if (status !== "active")
            s.sessions = s.sessions.filter((v) => v.staff_id !== id);
          s.audit.push({
            event: "staff_" + status,
            actor_id: actor,
            at: new Date().toISOString(),
          });
          return true;
        }),
    };
  const db = supabaseAdmin();
  return {
    async reserve(c: OtpChallenge) {
      return (
        check(await db.rpc("reserve_staff_otp", { p_challenge: c })) === true
      );
    },
    async delivery(id: string, delivered: boolean) {
      check(
        await db.rpc("staff_otp_delivery", {
          p_id: id,
          p_delivered: delivered,
        }),
      );
    },
    async verify(
      id: string,
      email: string,
      digest: string,
      sessionHash: string,
    ) {
      const result = check(
        await db.rpc("verify_staff_otp", {
          p_id: id,
          p_email: email,
          p_digest: digest,
          p_session_hash: sessionHash,
        }),
      );
      return result as Staff | null;
    },
    async deleteUser(actor: string, id: string, email: string) {
      return (
        deletionResult(
          await db.rpc("delete_clinic_staff", {
            p_actor: actor,
            p_id: id,
            p_email: email,
          }),
        ) === true
      );
    },
    async users() {
      return check(
        await db
          .from("clinic_staff")
          .select("*")
          .order("created_at", { ascending: false }),
      ) as Staff[];
    },
    async updateUser(
      actor: string,
      id: string,
      status: StaffStatus,
      role: "secretary" | "professor",
    ) {
      return (
        check(
          await db.rpc("manage_clinic_staff", {
            p_actor: actor,
            p_id: id,
            p_status: status,
            p_role: role,
          }),
        ) === true
      );
    },
  };
}
