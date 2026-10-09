import { getTranslations } from "@/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { PortalFrame } from "@/components/portal-frame";
import { UserManagement } from "@/components/user-management";
import { requireAdmin, PortalError } from "@/lib/portal/security";
import { authStore } from "@/lib/portal/auth-store";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return { title: t("ניהול צוות המרפאה") };
}
export default async function UsersPage() {
  const { t } = await getTranslations();

  try {
    await requireAdmin();
  } catch (e) {
    if (!(e instanceof PortalError)) throw e;
    return (
      <PortalFrame>
        <section className="login-card patient-panel">
          <h1>{t("גישה מוגבלת.")}</h1>
          <p className="panel-description">
            {t("ניהול המשתמשים זמין למנהל המערכת בלבד.")}
          </p>
          <Link href="/admin" className="button button-dark">
            {t("חזרה לסביבת המרפאה")}
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
