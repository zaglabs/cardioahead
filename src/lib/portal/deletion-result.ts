import "server-only";
import { PortalError } from "./security";
export function deletionResult<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    const code = (result.error as { code?: string }).code;
    if (["PGRST202", "42883", "42703", "PGRST204"].includes(code || ""))
      throw new PortalError(
        503,
        "DELETION_MIGRATION_REQUIRED",
        "יש להחיל את עדכון מסד הנתונים למחיקת תיקים ומשתמשים.",
      );
    throw new PortalError(
      503,
      "DELETION_FAILED",
      "המחיקה לא הושלמה. רעננו ונסו שוב.",
    );
  }
  return result.data;
}
