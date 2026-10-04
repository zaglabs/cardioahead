import type { Staff } from "./types";
export const OWNER_EMAIL = "galadv73@gmail.com";
export function isAdmin(staff: Staff) {
  return (
    staff.email === OWNER_EMAIL &&
    staff.role === "admin" &&
    staff.status === "active"
  );
}
