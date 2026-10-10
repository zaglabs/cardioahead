import { configured, authConfigured } from "@/lib/portal/config";
import { requireIdentity } from "@/lib/portal/security";
import { PortalFrame } from "@/components/portal-frame";
import { ClinicLogin } from "@/components/clinic-login";
import { StaffPending } from "@/components/staff-pending";
import { InvitationManagement } from "@/components/invitation-management";
export const dynamic = "force-dynamic";
export default async function InvitationsPage() {
  let identity = null;
  if (configured()) {
    try {
      identity = await requireIdentity();
    } catch {}
  }
  return (
    <PortalFrame>
      {identity?.status === "active" ? (
        <InvitationManagement staff={identity} />
      ) : identity ? (
        <StaffPending email={identity.email} />
      ) : (
        <ClinicLogin ready={authConfigured()} />
      )}
    </PortalFrame>
  );
}
