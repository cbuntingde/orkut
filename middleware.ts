// Ensures every page carries a CSRF token cookie.
//
// It has to happen here rather than in the root layout, because Next.js refuses
// to let a Server Component write cookies during render. The token itself is
// random per browser session; the client copies it into a request header, which
// is the half a cross-origin caller cannot do.

import { NextResponse, type NextRequest } from "next/server";
import { CSRF_COOKIE, newCsrfToken } from "@/lib/csrf-shared";

export function middleware(req: NextRequest) {
  if (req.cookies.get(CSRF_COOKIE)?.value) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set(CSRF_COOKIE, newCsrfToken(), {
    // Deliberately readable by JavaScript: the whole point of a double-submit
    // token is that the page copies the cookie value into a request header.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export const config = {
  // Pages only. API routes read the cookie themselves, and leaving them out
  // keeps the middleware off every fetch the app makes.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};