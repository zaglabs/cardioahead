import Link from "next/link";
import { PortalFrame } from "@/components/portal-frame";
import { ApiSettings } from "@/components/api-settings";
import { requireAdmin, PortalError } from "@/lib/portal/security";
import { getTranslations } from "@/lib/i18n/server";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t("מפתחות API") };
}
export default async function Page() {
  const { t } = await getTranslations();
  try {
    await requireAdmin();
  } catch (e) {
    if (!(e instanceof PortalError)) throw e;
    return (
      <PortalFrame>
        <section className="login-card patient-panel">
          <h1>{t("גישה מוגבלת.")}</h1>
          <p>{t("הפעולה זמינה למנהל המערכת בלבד.")}</p>
          <Link href="/admin" className="button button-dark">
            {t("חזרה לסביבת המרפאה")}
          </Link>
        </section>
      </PortalFrame>
    );
  }
  return (
    <PortalFrame>
      <ApiSettings />
    </PortalFrame>
  );
}
