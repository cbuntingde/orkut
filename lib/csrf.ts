import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf-shared";

// Two independent checks, because they fail differently:
//
//  1. Origin / Sec-Fetch-Site. A cross-site form post or fetch from evil.com
//     arrives with someone else's Origin and is rejected before anything is read.
//     This is the check that does most of the work, and it costs nothing.
//
//  2. A double-submit token. Middleware puts a random value in a cookie and the
//     request must repeat it in a header. A cross-origin caller cannot read the
//     cookie, so it cannot produce the header. This covers the cases where Origin
//     is absent or stripped, and it does not depend on the browser reporting
//     anything useful.
//
// Next.js already applies its own Origin check to server actions, so this is for
// the hand-written API routes under app/api.

export { CSRF_COOKIE, CSRF_HEADER };

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * True when the request plausibly came from our own pages.
 *
 * Sec-Fetch-Site is checked first because browsers always send it and it cannot
 * be forged by page JavaScript. Origin is the fallback for anything older.
 * A request with neither header is allowed through to the token check, which is
 * what non-browser clients such as curl or a mobile app look like; they cannot
 * carry the cookie cross-site anyway.
 */
export function sameOrigin(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const origin = headers.get("origin");
  if (!origin) return true;

  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === host;
}

export type CsrfFailure =
  | { ok: true }
  | { ok: false; reason: "origin" | "token"; error: string };

export async function checkCsrf(req: Request): Promise<CsrfFailure> {
  if (!sameOrigin(req.headers)) {
    return { ok: false, reason: "origin", error: "Cross-site request rejected" };
  }
  const cookie = (await cookies()).get(CSRF_COOKIE)?.value;
  const sent = req.headers.get(CSRF_HEADER);
  if (!cookie || !sent || !equal(cookie, sent)) {
    return {
      ok: false,
      reason: "token",
      error: "Missing or stale CSRF token, reload the page and try again",
    };
  }
  return { ok: true };
}