// The client address used as the rate-limit key.
//
// Kept in its own module, free of the database and of `next/headers`, because it
// is security-relevant parsing logic and the rest of this project deliberately
// keeps such logic runnable under plain Node — see scripts/verify-client-ip.ts.

/**
 * How many proxies sit in front of the app, and therefore how many entries at
 * the right-hand end of X-Forwarded-For were appended by something we control.
 * Override it when there is more than one (a CDN in front of a load balancer,
 * say). One is the common single-reverse-proxy case.
 */
export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  const n = raw ? Number(raw) : 1;
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * Accepts only something shaped like an IP address.
 *
 * This is not validation for its own sake. The limiter keys on this string, so
 * accepting free-form junk would let a caller mint an unlimited number of
 * distinct rate-limit buckets by varying one header. Rejecting it collapses
 * those callers onto one bucket, which is the safe direction to fail in.
 */
export function looksLikeIp(value: string): boolean {
  if (value.length > 45) return false;
  if (value.includes(":")) return /^[0-9a-f:]+$/i.test(value);
  const octets = value.split(".");
  if (octets.length !== 4) return false;
  return octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255);
}

/**
 * Best-effort client address for the throttle key.
 *
 * The RIGHTMOST X-Forwarded-For entry is the one our own proxy appended, so it is
 * the only entry an off-site caller cannot forge — everything to its left was
 * supplied by the client and can be anything. Taking the leftmost entry, which is
 * what the usual snippet does, means anyone able to reach the origin directly can
 * send a fresh value per request and walk straight past every limiter.
 *
 * The honest limit of this: it only holds when a proxy really is in front. With
 * nothing between the client and the origin, whatever the client sends is the only
 * address there is to read. On bare `next dev` every caller collapses to "local"
 * and the limits degrade to a single global bucket.
 */
export function clientIp(
  headers: Headers,
  env: Record<string, string | undefined> = process.env
): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    // Index can go negative when the header carries fewer entries than there are
    // trusted proxies. That yields undefined and falls through rather than
    // wrapping around to the far end of the list.
    const picked = hops[hops.length - trustedProxyHops(env)];
    if (picked && looksLikeIp(picked)) return picked;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real && looksLikeIp(real)) return real;
  return "local";
}