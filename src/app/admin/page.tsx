import type { Metadata } from "next";
import { configured, localTestMode } from "@/lib/portal/config";
import { requireStaff, appointmentView } from "@/lib/portal/security";
import { getStore } from "@/lib/portal/store";
import { PortalFrame } from "@/components/portal-frame";
import { ClinicLogin } from "@/components/clinic-login";
import { ClinicPortal } from "@/components/clinic-portal";
export const metadata: Metadata = { title: "סביבת המרפאה" };
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const ready = configured();
  let staff = null;
  if (ready) {
    try {
      staff = await requireStaff();
    } catch {}
  }
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
      ) : (
        <ClinicLogin ready={ready} local={localTestMode()} />
      )}
    </PortalFrame>
  );
}
