import type { Metadata } from "next";
import Link from "next/link";
import { PortalFrame } from "@/components/portal-frame";
import { UserManagement } from "@/components/user-management";
import { requireAdmin, PortalError } from "@/lib/portal/security";
import { authStore } from "@/lib/portal/auth-store";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ניהול צוות המרפאה" };
export default async function UsersPage() {
  try {
    await requireAdmin();
  } catch (e) {
    if (!(e instanceof PortalError)) throw e;
    return (
      <PortalFrame>
        <section className="login-card patient-panel">
          <h1>גישה מוגבלת.</h1>
          <p className="panel-description">
            ניהול המשתמשים זמין למנהל המערכת בלבד.
          </p>
          <Link href="/admin" className="button button-dark">
            חזרה לסביבת המרפאה
          </Link>
        </section>
      </PortalFrame>
    );
  }
  return (
    <PortalFrame>
      <UserManagement initialUsers={await authStore().users()} />
    </PortalFrame>
  );
}
