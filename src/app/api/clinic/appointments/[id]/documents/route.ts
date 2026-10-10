import { getStore } from "@/lib/portal/store";
import {
  requireStaff,
  sameOrigin,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
import { uploadDocument } from "@/lib/portal/upload-document";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const staff = await requireStaff(),
      { id } = await params;
    const appointment = await getStore().appointment(id);
    if (!appointment)
      throw new PortalError(404, "NOT_FOUND", "הביקור לא נמצא.");
    return json(
      { document: await uploadDocument(request, appointment, staff.id) },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
