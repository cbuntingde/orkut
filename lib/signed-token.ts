import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// A short-lived, signed, self-describing value carried in a cookie. It is used
// for the two-factor challenge, where the server needs to remember "this login
// passed the password check but has not yet proved possession of the phone"
// without creating a session row for a login that is not finished.
//
// The signature is what makes it trustworthy. Without it an attacker could mint
// a cookie naming any account and skip the second factor entirely.
//
// Everything here is pure so it can be tested without Next.js.

const MAX_AGE_SEC = 5 * 60;

/**
 * Derived from AUTH_SECRET under a distinct label, so the challenge key and the
 * TOTP encryption key are separate values even though both come from one secret.
 */
function key(purpose: string): Buffer {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(`orkut/signed-token/${purpose}/v1`).digest();
}

export type Challenge = {
  /** Account whose password has been checked and now needs a second factor. */
  sub: string;
  /** Unix seconds after which this is worthless. */
  exp: number;
  /** Attempts already spent, so the budget travels with the token. */
  tries: number;
  /** Random, so two challenges for the same account differ. */
  nonce: string;
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function issueChallenge(sub: string, maxAgeSec = MAX_AGE_SEC): { token: string; exp: number } {
  const payload: Challenge = {
    sub,
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
    tries: 0,
    nonce: randomBytes(12).toString("base64url"),
  };
  return { token: encodeChallenge(payload), exp: payload.exp };
}

export function encodeChallenge(payload: Challenge): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(createHmac("sha256", key("2fa")).update(body).digest())}`;
}

/**
 * Verifies signature, purpose and expiry. Returns null for anything that does
 * not check out; the caller treats null and "wrong code" identically.
 */
export function readChallenge(token: string | undefined, now = Date.now()): Challenge | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", key("2fa")).update(body).digest();
  } catch {
    return null;
  }
  const got = Buffer.from(signature, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;

  let payload: Challenge;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Challenge;
  } catch {
    return null;
  }
  if (
    typeof payload?.sub !== "string" ||
    typeof payload?.exp !== "number" ||
    typeof payload?.tries !== "number" ||
    typeof payload?.nonce !== "string"
  ) {
    return null;
  }
  if (payload.exp * 1000 < now) return null;
  return payload;
}

/** Re-issues the same challenge with the attempt counter spent. */
export function spendAttempt(payload: Challenge): string {
  return encodeChallenge({ ...payload, tries: payload.tries + 1 });
}