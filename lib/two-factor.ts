import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/drizzle/schema";
import { decryptSecret, verifyTotp } from "@/lib/totp";
import { spendRecoveryCode } from "@/lib/totp-actions";
import type { Challenge } from "@/lib/signed-token";

// The second half of a two-factor login. Runs before any session exists, which is
// why it takes the signed challenge as an argument instead of reading a session.

export const MAX_TWO_FACTOR_TRIES = 5;

export type SecondFactorResult =
  | { ok: true; via: "totp" | "recovery" }
  | { ok: false; triesLeft: number; error: string };

/**
 * A submitted code is a TOTP code if it is exactly six digits; anything else is
 * treated as a recovery code. Guessing between the two is pointless because both
 * come back as the same generic failure.
 */
function looksLikeTotp(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export async function completeSecondFactor(
  challenge: Challenge,
  submitted: string,
  triesLeft: number
): Promise<SecondFactorResult> {
  const code = submitted.trim();
  if (!code) return { ok: false, triesLeft, error: "Enter the 6-digit code." };

  const row = (await db.select().from(users).where(eq(users.id, challenge.sub)).limit(1))[0];
  // An account that turned 2FA off between issuing and answering the challenge
  // must not be left with a challenge it can never satisfy.
  if (!row?.totpSecret || !row.totpEnabledAt) {
    return { ok: false, triesLeft, error: "Two-factor is not set up on this account." };
  }

  const remaining = triesLeft - 1;

  if (!looksLikeTotp(code)) {
    const spent = await spendRecoveryCode(row.id, code);
    if (spent) return { ok: true, via: "recovery" };
    return { ok: false, triesLeft: remaining, error: "That code is not right." };
  }

  let secret: string;
  try {
    secret = decryptSecret(row.totpSecret);
  } catch {
    // A wrong or rotated encryption key lands here. It is a server fault, not a
    // failed guess, so the attempt budget is not charged for it.
    return { ok: false, triesLeft, error: "Two-factor is not readable on this server." };
  }

  const result = verifyTotp(secret, code);
  if (!result.ok) return { ok: false, triesLeft: remaining, error: "That code is not right." };

  // Replay guard. The update only lands if no higher counter has been spent since
  // the row was read, so the same code cannot be accepted twice even if two
  // requests arrive together.
  const claimed = await db
    .update(users)
    .set({ totpLastCounter: result.counter })
    .where(
      and(
        eq(users.id, row.id),
        or(isNull(users.totpLastCounter), lt(users.totpLastCounter, result.counter))
      )
    )
    .returning({ id: users.id });

  if (!claimed.length) {
    return { ok: false, triesLeft: remaining, error: "That code has already been used." };
  }
  return { ok: true, via: "totp" };
}