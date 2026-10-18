import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (!request.cookies.get("jc_csrf")) {
    response.cookies.set({
      name: "jc_csrf",
      value: crypto.randomUUID(),
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production"
    });
  }
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  const path = request.nextUrl.pathname;
  if (
    path === "/" ||
    path.startsWith("/reports") ||
    path.startsWith("/documents") ||
    path.startsWith("/new") ||
    path.startsWith("/r/") ||
    path.startsWith("/api/")
  ) {
    response.headers.set("cache-control", "no-store");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"]
};
