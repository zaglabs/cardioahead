import { getTranslations } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { authConfigured, configured } from "@/lib/portal/config";
import { requireIdentity, appointmentView } from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import { PortalFrame } from "@/components/portal-frame";
import { ClinicLogin } from "@/components/clinic-login";
import { ClinicPortal } from "@/components/clinic-portal";
import { StaffPending } from "@/components/staff-pending";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return { title: t("סביבת המרפאה") };
}
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  let identity = null;
  if (configured()) {
    try {
      identity = await requireIdentity();
    } catch {}
  }
  const staff = identity?.status === "active" ? identity : null;
  const store = staff ? getStore() : null;
  const appointments = store ? await store.appointments() : [];
  const initialAppointments = store
    ? await Promise.all(
        appointments.map(async (a) =>
          appointmentView(a, await store.documents(a.id)),
        ),
      )
    : [];
  return (
    <PortalFrame>
      {staff ? (
        <ClinicPortal staff={staff} initialAppointments={initialAppointments} />
      ) : identity ? (
        <StaffPending email={identity.email} />
      ) : (
        <ClinicLogin ready={authConfigured()} />
      )}
    </PortalFrame>
  );
}
