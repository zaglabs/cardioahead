import {
  requirePatient,
  sameOrigin,
  json,
  failure,
} from "@/lib/portal/security";
import { uploadDocument } from "@/lib/portal/upload-document";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const appointment = await requirePatient();
    return json({ document: await uploadDocument(request, appointment) }, 201);
  } catch (error) {
    return failure(error);
  }
}
