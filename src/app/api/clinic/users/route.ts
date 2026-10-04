import {
  requireAdmin,
  sameOrigin,
  body,
  text,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
import { authStore } from "@/lib/portal/auth-store";
import { OWNER_EMAIL } from "@/lib/portal/staff-access";
export async function GET() {
  try {
    await requireAdmin();
    return json({ users: await authStore().users() });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    const admin = await requireAdmin();
    const input = await body(request);
    const id = text(input.id, 36);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !["active", "suspended", "rejected"].includes(String(input.status)) ||
      !["secretary", "professor"].includes(String(input.role))
    )
      throw new PortalError(
        400,
        "BAD_REQUEST",
        "בדקו את ההרשאה ואת מצב החשבון.",
      );
    if (id === admin.id)
      throw new PortalError(
        403,
        "OWNER_PROTECTED",
        "לא ניתן לשנות את חשבון מנהל המערכת.",
      );
    const store = authStore();
    const users = await store.users();
    if (users.find((v) => v.id === id)?.email === OWNER_EMAIL)
      throw new PortalError(403, "OWNER_PROTECTED", "חשבון מנהל המערכת מוגן.");
    const ok = await store.updateUser(
      admin.id,
      id,
      input.status as "active" | "suspended" | "rejected",
      input.role as "secretary" | "professor",
    );
    if (!ok) throw new PortalError(404, "USER_NOT_FOUND", "החשבון לא נמצא.");
    return json({ ok: true, users: await store.users() });
  } catch (e) {
    return failure(e);
  }
}
