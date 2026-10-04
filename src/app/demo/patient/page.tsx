import type { Metadata } from "next";
import { DemoFrame } from "@/components/demo-frame";
import { PatientDemo } from "@/components/patient-demo";
export const metadata: Metadata = { title: "הדגמת מרחב המטופל" };
export default function PatientDemoPage() {
  return (
    <DemoFrame active="patient">
      <PatientDemo />
    </DemoFrame>
  );
}
