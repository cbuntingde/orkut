import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { readChallenge, spendAttempt } from "@/lib/signed-token";
import { TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";
import { MAX_TWO_FACTOR_TRIES, completeSecondFactor } from "@/lib/two-factor";
import { hit, clientIp } from "@/lib/rate-limit";

// Step two of a two-factor login. Reached only after the password was accepted
// and a signed challenge was placed in a short-lived cookie. There is no session
// before this point, so a wrong or missing code leaves nothing behind.
//
// Attempts are counted twice over: once in the signed cookie, which an attacker
// cannot reset without knowing AUTH_SECRET, and once per IP, which stops one
// machine from collecting unlimited challenges.

const LIMITS = {
  perIp: { limit: 20, window: 15 * 60 },
  perChallenge: { limit: MAX_TWO_FACTOR_TRIES, window: 10 * 60 },
} as const;

export async function POST(req: Request) {
  const csrf = await checkCsrf(req);
  if (!csrf.ok) return NextResponse.json({ error: csrf.error }, { status: 403 });

  const ip = clientIp(req.headers);
  const ipLimit = await hit(`2fa:ip:${ip}`, LIMITS.perIp.limit, LIMITS.perIp.window);
  if (!ipLimit.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const jar = await cookies();
  const challenge = readChallenge(jar.get(TWO_FACTOR_COOKIE)?.value);
  if (!challenge) {
    // No cookie, a forged one, or one that expired. All three are the same
    // thing to the caller: start over.
    return NextResponse.json({ error: "Your login attempt expired. Please sign in again." }, { status: 401 });
  }

  if (challenge.tries >= MAX_TWO_FACTOR_TRIES) {
    jar.delete(TWO_FACTOR_COOKIE);
    return NextResponse.json({ error: "Too many codes tried. Please sign in again." }, { status: 429 });
  }

  const budget = await hit(`2fa:c:${challenge.nonce}`, LIMITS.perChallenge.limit, LIMITS.perChallenge.window);
  if (!budget.ok) {
    return NextResponse.json({ error: "Too many codes tried. Please sign in again." }, { status: 429 });
  }

  let submitted: string;
  try {
    const body = (await req.json()) as { code?: string };
    submitted = body.code ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await completeSecondFactor(challenge, submitted, MAX_TWO_FACTOR_TRIES);
  if (!result.ok) {
    // Re-issue the cookie with the spent attempt, or clear it once the budget is
    // gone. Either way the caller cannot tell a wrong code from a spent budget.
    if (result.triesLeft <= 0) jar.delete(TWO_FACTOR_COOKIE);
    else jar.set(TWO_FACTOR_COOKIE, spendAttempt(challenge), { ...CHALLENGE_COOKIE, expires: new Date(challenge.exp * 1000) });
    return NextResponse.json({ error: result.error, triesLeft: Math.max(0, result.triesLeft) }, { status: 401 });
  }

  const row = (await db.select().from(users).where(eq(users.id, challenge.sub)).limit(1))[0];
  if (!row) {
    jar.delete(TWO_FACTOR_COOKIE);
    return NextResponse.json({ error: "Account not found." }, { status: 401 });
  }

  await createSession(row.id);
  jar.delete(TWO_FACTOR_COOKIE);
  return NextResponse.json({ ok: true, via: result.via });
}

const CHALLENGE_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};