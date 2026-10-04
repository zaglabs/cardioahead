import type { Metadata } from "next";
import { ServiceUnavailable } from "@/components/service-unavailable";
export const metadata: Metadata = { title: "כניסה לצוות המרפאה" };
export default function AdminPage() {
  return <ServiceUnavailable clinic />;
}
