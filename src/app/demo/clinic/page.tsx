import type { Metadata } from "next";
import { DemoFrame } from "@/components/demo-frame";
import { ClinicDemo } from "@/components/clinic-demo";
export const metadata: Metadata = { title: "הדגמת סביבת המרפאה" };
export default function ClinicDemoPage() {
  return (
    <DemoFrame active="clinic">
      <ClinicDemo />
    </DemoFrame>
  );
}
