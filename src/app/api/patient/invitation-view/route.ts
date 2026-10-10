import { sameOrigin, body, json, failure, hash } from "@/lib/portal/security";
import { recordInvitationView } from "@/lib/invitations/store";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = await body(request);
    if (
      typeof input.token === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(input.token)
    )
      await recordInvitationView(hash(input.token));
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
