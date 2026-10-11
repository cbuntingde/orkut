import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/drizzle/schema";
import { hashPassword, verifyPassword, createSession, equalizeTiming, needsRehash, rehashPassword } from "@/lib/auth";
import { passwordProblems, MIN_LENGTH } from "@/lib/password";
import { hit, clear, clientIp } from "@/lib/rate-limit";
import {
  issueVerificationToken, verificationUrl, verificationRequired, canSurfaceVerificationLink,
} from "@/lib/email-verification";
import { sendMail } from "@/lib/mail";
import { checkCsrf } from "@/lib/csrf";
import { issueChallenge } from "@/lib/signed-token";
import { TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";

// Limits are per IP *and* per account, so neither a single host spraying one
// account nor one account sprayed from many hosts gets an unlimited runway.
const LIMITS = {
  loginIp: { limit: 20, window: 15 * 60 },
  loginAccount: { limit: 10, window: 15 * 60 },
  signupIp: { limit: 5, window: 60 * 60 },
  resend: { limit: 3, window: 60 * 60 },
} as const;

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function seconds(n: number) {
  const m = Math.floor(n / 60);
  return m >= 1 ? `${m} minute${m === 1 ? "" : "s"}` : `${n} second${n === 1 ? "" : "s"}`;
}

/**
 * The single answer every signup receives. Deliberately identical whether or not
 * the address was free: saying "already registered" is what let an attacker map
 * which addresses have accounts here. Reaching the user is the only way to learn
 * whether a signup worked.
 */
const SIGNUP_ANSWER =
  "If that address can be used, we have sent a verification link to it. Check your inbox.";

export async function POST(req: Request, { params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  const ip = clientIp(req.headers);

  // Every mode here changes server state, so all of them are held to the same bar.
  const csrf = await checkCsrf(req);
  if (!csrf.ok) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }

  let body: {
    name?: string; email?: string; password?: string; confirmPassword?: string; resend?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (mode === "resend") {
    return handleResend(email, ip);
  }

  if (!isEmail(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  if (mode === "signup") {
    const signup = await hit(`signup:${ip}`, LIMITS.signupIp.limit, LIMITS.signupIp.window);
    if (!signup.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${seconds(signup.retryAfterSec)}.` },
        { status: 429 }
      );
    }

    const name = (body.name ?? "").trim();
    if (name.length < 2) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
    if (password.length < MIN_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${MIN_LENGTH} characters.` }, { status: 400 });
    }
    const problems = passwordProblems(password, { name, email });
    if (problems.length) return NextResponse.json({ error: problems[0] }, { status: 400 });
    if ((body.confirmPassword ?? "") !== password) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let created = false;
    let userId = existing[0]?.id ?? null;

    if (existing.length) {
      // An unverified account that re-signs-up gets a new link, which is the
      // only legitimate reason to revisit this path.
      if (existing[0].emailVerifiedAt) {
        await equalizeTiming();
        return NextResponse.json({ ok: true, message: SIGNUP_ANSWER });
      }
      // Spend the same password hashing here as the new-account branch does.
      // Without it this branch skips hashing entirely and answers measurably
      // faster, which is itself enough to tell registered from unregistered.
      await equalizeTiming();
    } else {
      const passwordHash = await hashPassword(password);
      const inserted = await db
        .insert(users)
        .values({ name, email, passwordHash, luckyPct: 30 + Math.floor(Math.random() * 65) })
        .returning({ id: users.id });
      userId = inserted[0].id;
      created = true;
    }

    const token = await issueVerificationToken(userId!);
    const link = verificationUrl(token);
    const sent = await sendMail({
      to: email,
      subject: "Confirm your orkut address",
      text: [
        `Welcome to orkut, ${name}.`,
        "",
        "Confirm this address to finish setting up your profile:",
        link,
        "",
        `The link works once and expires in 24 hours.`,
        created ? "" : "If you did not ask for this, ignore this message and nothing will happen.",
      ].join("\n"),
    });

    if (verificationRequired()) {
      // No session yet: the account is real but unverified.
      const payload: Record<string, unknown> = { ok: true, message: SIGNUP_ANSWER };
      // Local development convenience only, so the console transport is usable.
      if (canSurfaceVerificationLink() && sent.ok) payload.devVerificationLink = link;
      return NextResponse.json(payload);
    }

    await createSession(userId!);
    const payload: Record<string, unknown> = { ok: true, message: SIGNUP_ANSWER };
    if (canSurfaceVerificationLink() && sent.ok) payload.devVerificationLink = link;
    return NextResponse.json(payload);
  }

  if (mode === "login") {
    // Throttle first, always. Password length is deliberately not checked here:
    // a valid short password is still a valid password, and validating before the
    // limiter would let short guesses bypass the budget entirely.
    const [ipLimit, acctLimit] = await Promise.all([
      hit(`login:ip:${ip}`, LIMITS.loginIp.limit, LIMITS.loginIp.window),
      hit(`login:acct:${email}`, LIMITS.loginAccount.limit, LIMITS.loginAccount.window),
    ]);
    const blocked = !ipLimit.ok ? ipLimit : !acctLimit.ok ? acctLimit : null;
    if (blocked) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${seconds(blocked.retryAfterSec)}.` },
        { status: 429 }
      );
    }

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user) {
      // Spend the same CPU a real check would, so a missing account is not
      // distinguishable from a wrong password by response time.
      await equalizeTiming();
      return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
    }

    // A success clears that account's budget so an ordinary user who fumbled a
    // few times is not left one mistake away from a lockout.
    await clear(`login:acct:${email}`);
    // Transparent upgrade: an old hash is cheaper to compute than the dummy used
    // for unknown accounts, which is a timing oracle for "is this email
    // registered". Re-deriving on success closes that gap for good.
    if (needsRehash(user.passwordHash)) await rehashPassword(user.id, password);

    // Password is correct. If the account has 2FA, that is not the end of the
    // login: no session is created until the second factor is proved, so a
    // stolen password alone gets an attacker nothing.
    if (user.totpEnabledAt && user.totpSecret) {
      const { token, exp } = issueChallenge(user.id);
      const jar = await cookies();
      jar.set(TWO_FACTOR_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(exp * 1000),
      });
      // "needTwoFactor" reveals only that this account has 2FA, which the
      // password holder already knows, and never which account it belongs to.
      return NextResponse.json({ needTwoFactor: true });
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown mode" }, { status: 404 });
}

/**
 * Resending must never reveal whether an address exists either, so this answers
 * identically for unknown addresses, already-verified accounts, and fresh links.
 */
async function handleResend(email: string, ip: string) {
  if (!isEmail(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const limit = await hit(`resend:${ip}`, LIMITS.resend.limit, LIMITS.resend.window);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const answer = NextResponse.json({ ok: true, message: "If that address needs verifying, a new link is on its way." });

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || user.emailVerifiedAt) return answer;

  const token = await issueVerificationToken(user.id);
  await sendMail({
    to: email,
    subject: "Your orkut verification link",
    text: `Confirm your orkut address:\n\n${verificationUrl(token)}\n\nThis link works once and expires in 24 hours.`,
  });
  return answer;
}