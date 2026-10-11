import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailVerificationTokens, users } from "@/drizzle/schema";

const TTL_HOURS = 24;

/**
 * Verification tokens are single use and stored only as a hash. The raw token
 * exists solely inside the emailed link, so someone who later reads the database
 * cannot turn a leak into verified accounts.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verificationUrl(token: string): string {
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

/** Invalidates any outstanding tokens and issues a fresh one. Returns the raw token. */
export async function issueVerificationToken(userId: string): Promise<string> {
  // Bound how many live tokens an account can accumulate, so repeatedly asking
  // for a resend cannot grow the table without limit.
  await db.delete(emailVerificationTokens).where(
    and(
      eq(emailVerificationTokens.userId, userId),
      sql`(${emailVerificationTokens.createdAt} < NOW() - INTERVAL '1 day' OR ${emailVerificationTokens.consumedAt} IS NOT NULL)`
    )
  );

  const token = newToken();
  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
  });
  return token;
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/** Consumes a token. Marks the account verified and clears the token. */
export async function consumeVerificationToken(token: string): Promise<VerifyOutcome> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.consumedAt) return { ok: false, reason: "used" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };

  await db
    .update(emailVerificationTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailVerificationTokens.id, row.id), isNull(emailVerificationTokens.consumedAt)));
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  return { ok: true };
}

export async function isVerified(userId: string): Promise<boolean> {
  const rows = await db
    .select({ at: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return !!rows[0]?.at;
}

/**
 * Whether signup should require a verified address before the account is usable.
 * On by default. Turning it off is explicitly a local-development choice: it
 * reopens the enumeration leak that P4.3 exists to close.
 */
export function verificationRequired(): boolean {
  if (process.env.REQUIRE_EMAIL_VERIFICATION) {
    return process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
  }
  return true;
}

/** In development the console transport prints the link; surfacing it is safe there only. */
export function canSurfaceVerificationLink(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function latestTokenIssuedAt(userId: string): Promise<Date | null> {
  const rows = await db
    .select({ at: emailVerificationTokens.createdAt })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
    .orderBy(desc(emailVerificationTokens.createdAt))
    .limit(1);
  return rows[0]?.at ?? null;
}