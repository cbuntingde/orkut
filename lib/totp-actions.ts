"use server";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { twoFactorRecovery, users } from "@/drizzle/schema";
import { requireUser, verifyPassword } from "@/lib/auth";
import {
  decryptSecret,
  encryptionConfigured,
  encryptSecret,
  generateSecret,
  otpauthUrl,
  verifyTotp,
} from "@/lib/totp";

// Two-factor enrollment and removal.
//
// Enrollment is two steps on purpose. The secret is written to the database as
// soon as it is generated, but `totp_enabled_at` stays null until a working code
// has been proved. An account is therefore only "on" once the user has actually
// run their authenticator against it, so a half-finished setup can never lock
// anyone out.

const ISSUER = "orkut";
const RECOVERY_CODE_COUNT = 10;

export type TwoFactorState = {
  enabled: boolean;
  /** True when a secret exists but has not been confirmed yet. */
  pending: boolean;
  /** True when the server has no key and therefore cannot store a secret. */
  unavailable: boolean;
};

export async function twoFactorState(userId: string): Promise<TwoFactorState> {
  const row = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  return {
    enabled: !!row?.totpEnabledAt,
    pending: !!row?.totpSecret && !row?.totpEnabledAt,
    unavailable: !encryptionConfigured(),
  };
}

/**
 * Step 1. Returns the provisioning URI to render as a QR code. Nothing is
 * confirmed yet; call `confirmTwoFactor` with a code from the authenticator.
 */
export async function beginTwoFactor(): Promise<{ ok: boolean; otpauth?: string; error?: string }> {
  const user = await requireUser();
  if (!encryptionConfigured()) {
    return { ok: false, error: "This server has no TOTP encryption key configured." };
  }

  const secret = generateSecret();
  await db
    .update(users)
    .set({ totpSecret: encryptSecret(secret), totpEnabledAt: null, totpLastCounter: null })
    .where(eq(users.id, user.id));

  return {
    ok: true,
    otpauth: otpauthUrl({ secret, account: user.email, issuer: ISSUER }),
  };
}

/**
 * Step 2. Proves the authenticator works, then turns 2FA on and hands back a
 * fresh set of recovery codes. They are returned once and only once.
 */
export async function confirmTwoFactor(
  code: string
): Promise<{ ok: boolean; recoveryCodes?: string[]; error?: string }> {
  const user = await requireUser();
  const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!row?.totpSecret) return { ok: false, error: "Start the setup again." };
  if (row.totpEnabledAt) return { ok: false, error: "Two-factor is already on." };

  let secret: string;
  try {
    secret = decryptSecret(row.totpSecret);
  } catch {
    return { ok: false, error: "The stored secret could not be read on this server." };
  }

  const result = verifyTotp(secret, code);
  if (!result.ok) return { ok: false, error: "That code is not right. Check the time on your device." };

  await db
    .update(users)
    .set({ totpEnabledAt: new Date(), totpLastCounter: result.counter })
    .where(eq(users.id, user.id));

  const recoveryCodes = await replaceRecoveryCodes(user.id);
  return { ok: true, recoveryCodes };
}

/** Abandons a setup that was started but never confirmed. */
export async function cancelTwoFactor(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db
    .update(users)
    .set({ totpSecret: null, totpEnabledAt: null, totpLastCounter: null })
    .where(and(eq(users.id, user.id), isNull(users.totpEnabledAt)));
  return { ok: true };
}

/**
 * Turns 2FA off. Requires the current password: this is the one control that
 * stops someone who borrowed an unlocked phone from removing the second factor
 * from someone else's account.
 */
export async function disableTwoFactor(
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!row?.totpEnabledAt) return { ok: false, error: "Two-factor is not on." };
  if (!(await verifyPassword(password, row.passwordHash))) {
    return { ok: false, error: "Password is wrong." };
  }

  await db
    .update(users)
    .set({ totpSecret: null, totpEnabledAt: null, totpLastCounter: null })
    .where(eq(users.id, user.id));
  await db.delete(twoFactorRecovery).where(eq(twoFactorRecovery.userId, user.id));
  return { ok: true };
}

export async function recoveryCodesRemaining(userId: string): Promise<number> {
  const rows = await db
    .select({ id: twoFactorRecovery.id })
    .from(twoFactorRecovery)
    .where(and(eq(twoFactorRecovery.userId, userId), isNull(twoFactorRecovery.usedAt)));
  return rows.length;
}

// ------------------------------------------------------------------- internals

/** 80 bits per code, shown in four groups of four. Stored only as a hash. */
function generateRecoveryCodes(): { plain: string; hash: string }[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const bytes = randomBytes(10);
    let code = "";
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) code += "-";
      code += alphabet[bytes[i % 10] % alphabet.length];
    }
    return { plain: code, hash: hashRecoveryCode(code) };
  });
}

function hashRecoveryCode(code: string): string {
  // Normalised so a user typing a code without dashes still matches.
  const normalised = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(normalised).digest("hex");
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.delete(twoFactorRecovery).where(eq(twoFactorRecovery.userId, userId));
  await db.insert(twoFactorRecovery).values(codes.map((c) => ({ userId, codeHash: c.hash })));
  return codes.map((c) => c.plain);
}

/**
 * Spends a recovery code if it is valid and unused, and reports whether it
 * matched. Exported for the login route, which runs before there is a session.
 */
export async function spendRecoveryCode(userId: string, code: string): Promise<boolean> {
  const hash = hashRecoveryCode(code);
  const match = await db
    .select({ id: twoFactorRecovery.id })
    .from(twoFactorRecovery)
    .where(
      and(
        eq(twoFactorRecovery.userId, userId),
        eq(twoFactorRecovery.codeHash, hash),
        isNull(twoFactorRecovery.usedAt)
      )
    )
    .limit(1);
  const row = match[0];
  if (!row) return false;

  // Conditional on used_at still being null, so two concurrent submissions of the
  // same code cannot both succeed.
  const spent = await db
    .update(twoFactorRecovery)
    .set({ usedAt: new Date() })
    .where(and(eq(twoFactorRecovery.id, row.id), isNull(twoFactorRecovery.usedAt)))
    .returning({ id: twoFactorRecovery.id });

  return spent.length === 1;
}