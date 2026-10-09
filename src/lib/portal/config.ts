import "server-only";
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENTS = 10;
export const BUCKET = "cardioahead-private";
export function localTestMode() {
  return !process.env.VERCEL && process.env.CARDIOAHEAD_LOCAL_TEST === "true";
}
export function supabaseServerKey() {
  return (
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
export function configured() {
  return Boolean(
    (localTestMode() || (process.env.SUPABASE_URL && supabaseServerKey())) &&
    (process.env.CARDIOAHEAD_SESSION_SECRET?.length ?? 0) >= 32,
  );
}
export function authConfigured() {
  return (
    configured() &&
    Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
  );
}
export function secret() {
  if (!configured()) throw new Error("SERVICE_NOT_CONFIGURED");
  return process.env.CARDIOAHEAD_SESSION_SECRET!;
}
