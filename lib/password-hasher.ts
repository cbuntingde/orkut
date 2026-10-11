import { timingSafeEqual } from "node:crypto";

// Argon2id is memory-hard, so it resists GPU cracking far better than PBKDF2 at
// any wall-clock cost. Parameters are OWASP's recommended minimum for Argon2id.
// The encoded hash carries its own parameters, so these can be raised later and
// old hashes keep verifying.
const ARGON2 = {
  algorithm: 2, // argon2id
  memoryCost: 19_456, // KiB, OWASP minimum
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

// Kept for reading hashes written before the move to Argon2id. New passwords
// never use this path; it exists so nobody is locked out of their account.
const PBKDF2_FLOOR = 600_000;

type Argon2Module = {
  hash(pw: string, opts: unknown): Promise<string>;
  verify(hashed: string, pw: string): Promise<boolean>;
  Algorithm: { Argon2id: number };
};

let cached: Argon2Module | null = null;

async function argon2(): Promise<Argon2Module | null> {
  if (cached) return cached;
  try {
    cached = (await import("@node-rs/argon2")) as unknown as Argon2Module;
    return cached;
  } catch {
    // Missing native module. PBKDF2 still works, so this degrades rather than
    // breaking every login on the machine.
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const a = await argon2();
  if (a) {
    return a.hash(password, { ...ARGON2, algorithm: a.Algorithm.Argon2id });
  }
  return pbkdf2(password);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$argon2")) {
    const a = await argon2();
    if (!a) return false;
    try {
      return await a.verify(stored, password);
    } catch {
      return false;
    }
  }
  if (stored.startsWith("pbkdf2$")) return pbkdf2Verify(password, stored);
  return false;
}

/** True when the stored hash uses weaker parameters than current policy. */
export function needsRehash(stored: string): boolean {
  if (stored.startsWith("$argon2id$")) {
    // The encoded string carries m= and t=, so read what was actually used.
    const m = /m=(\d+)/.exec(stored);
    const t = /t=(\d+)/.exec(stored);
    const p = /p=(\d+)/.exec(stored);
    return (
      Number(m?.[1] ?? 0) < ARGON2.memoryCost ||
      Number(t?.[1] ?? 0) < ARGON2.timeCost ||
      Number(p?.[1] ?? 1) < ARGON2.parallelism
    );
  }
  // Every PBKDF2 hash here predates the move to Argon2id, so all of them are due
  // an upgrade. Comparing against the iteration floor instead would call a
  // 600,000-round hash current and those accounts would never be rehashed.
  return stored.startsWith("pbkdf2$");
}

// ---------------------------------------------------------------- legacy pbkdf2

async function deriveBits(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  return await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations, hash: "SHA-256" },
    key, 256
  );
}

async function pbkdf2(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const bits = await deriveBits(password, salt, PBKDF2_FLOOR);
  return `pbkdf2$${PBKDF2_FLOOR}$${Buffer.from(salt).toString("hex")}$${Buffer.from(bits).toString("hex")}`;
}

async function pbkdf2Verify(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], "hex");
  const want = Buffer.from(parts[3], "hex");
  const bits = await deriveBits(password, new Uint8Array(salt), iterations);
  const got = Buffer.from(bits);
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

/**
 * A hash the verifier will spend comparable CPU on, used when an account does not
 * exist so a missing address and a wrong password take the same time to answer.
 * It has to be a real, parseable hash at current parameters: a hand-built string
 * fails to parse and skips the work, reopening the very timing oracle this exists
 * to close. DUMMY_ARGON2 is the Argon2id hash of the throwaway string
 * "timing-equalizer", so verifying anything against it yields false.
 */
const DUMMY_ARGON2 =
  "$argon2id$v=19$m=19456,t=2,p=1$RaNiBOoU5oW/x7O16oc7Dg$1ptgjMxwNtIdqm+qTGsLBxJngzORvOKS2DzTgz8XxFk";

const DUMMY_PBKDF2 =
  "pbkdf2$600000$00000000000000000000000000000000$" +
  "0000000000000000000000000000000000000000000000000000000000000000";

export async function dummyVerify(): Promise<void> {
  if (await argon2()) {
    await verifyPassword("timing-equalizer", DUMMY_ARGON2);
    return;
  }
  await pbkdf2Verify("timing-equalizer", DUMMY_PBKDF2);
}