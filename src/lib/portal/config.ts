import "server-only";
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENTS = 10;
export const BUCKET = "cardioahead-private";
export function localTestMode() {
  return !process.env.VERCEL && process.env.CARDIOAHEAD_LOCAL_TEST === "true";
}
export function configured() {
  if (localTestMode())
    return Boolean(
      process.env.CARDIOAHEAD_LOCAL_PASSWORD &&
      (process.env.CARDIOAHEAD_SESSION_SECRET?.length ?? 0) >= 32,
    );
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.CARDIOAHEAD_SESSION_SECRET?.length ?? 0) >= 32,
  );
}
export function secret() {
  if (!configured()) throw new Error("SERVICE_NOT_CONFIGURED");
  return process.env.CARDIOAHEAD_SESSION_SECRET!;
}
