import { PortalFrame } from "@/components/portal-frame";
import { SecureReport } from "@/components/secure-report";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Secure Report",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <PortalFrame>
      <SecureReport token={(await params).token} />
    </PortalFrame>
  );
}
