import { NextResponse, type NextRequest } from "next/server";
import { LANGUAGE_COOKIE } from "@/lib/i18n/catalog";
export function proxy(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("lang");
  const cookie = request.cookies.get(LANGUAGE_COOKIE)?.value;
  const language =
    query === "he" || query === "en" ? query : cookie === "en" ? "en" : "he";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-cardioahead-language", language);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if ((query === "he" || query === "en") && cookie !== language)
    response.cookies.set(LANGUAGE_COOKIE, language, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|favicon.ico|test-documents/.*\\.pdf).*)",
  ],
};
