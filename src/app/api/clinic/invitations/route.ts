import {
  requireStaff,
  json,
  failure,
  PortalError,
} from "@/lib/portal/security";
import { listInvitations } from "@/lib/invitations/store";
export async function GET(request: Request) {
  try {
    const staff = await requireStaff(),
      p = new URL(request.url).searchParams;
    const search = (p.get("search") || "").trim(),
      status = p.get("status") || "all",
      followup = p.get("followup") || "all";
    const offset = Number(p.get("offset") || 0),
      limit = 50;
    if (
      search.length > 200 ||
      !["all", "active", "expired", "revoked", "deleted"].includes(status) ||
      ![
        "all",
        "not_opened",
        "no_documents",
        "import_failed",
        "import_pending",
      ].includes(followup) ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 500000
    )
      throw new PortalError(400, "BAD_FILTERS", "בדקו את מסנני החיפוש.");
    return json(
      await listInvitations(staff.id, {
        search,
        status,
        followup,
        deleted: p.get("deleted") === "true" || status === "deleted",
        offset,
        limit,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
