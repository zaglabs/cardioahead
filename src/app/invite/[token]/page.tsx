import { getTranslations } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { configured } from "@/lib/portal/config";
import { PortalFrame } from "@/components/portal-frame";
import { PatientPortal } from "@/components/patient-portal";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return { title: t("הכנה לביקור") };
}
export const dynamic = "force-dynamic";
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <PortalFrame>
      <PatientPortal token={token} ready={configured()} />
    </PortalFrame>
  );
}
