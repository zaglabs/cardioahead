import { reportIdentity } from "@/lib/visit/access";
import { json, failure } from "@/lib/portal/security";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    return json(await reportIdentity((await params).token));
  } catch (e) {
    return failure(e);
  }
}
