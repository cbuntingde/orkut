import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// TOTP per RFC 6238: HOTP (RFC 4226) over a counter derived from wall-clock time.
// HMAC-SHA1 with a 30 second step and 6 digits is what every authenticator app
// assumes. SHA256/SHA512 exist so the implementation can be checked against the
// full set of published test vectors in RFC 6238 appendix B.

export type TotpAlgorithm = "sha1" | "sha256" | "sha512";

export type TotpOptions = {
  digits?: number;
  algorithm?: TotpAlgorithm;
  step?: number;
  /** Offset in seconds, RFC 6238 section 4.5. */
  epoch?: number;
};

const DEFAULTS = { digits: 6, algorithm: "sha1" as const, step: 30, epoch: 0 };

// ------------------------------------------------------------- base32 (RFC 4648)

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * RFC 4648 base32 without padding, which is the form authenticator apps expect.
 * The alphabet is not the padded RFC 4648 ordering on its own, so this is not a
 * general-purpose encoder.
 */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Not base32: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ------------------------------------------------------------------ the algorithm

/** RFC 4226 HOTP: HMAC the counter, truncate, take the low digits. */
export function hotp(secret: string, counter: number, opts: TotpOptions = {}): string {
  const { digits, algorithm } = { ...DEFAULTS, ...opts };
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, key).update(buf).digest();

  // Dynamic truncation: the low nibble of the last byte selects an offset.
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return String(code % 10 ** digits).padStart(digits, "0");
}

export function counterFor(timeSeconds: number, opts: TotpOptions = {}): number {
  const { step, epoch } = { ...DEFAULTS, ...opts };
  return Math.floor((timeSeconds - epoch) / step);
}

export function totp(secret: string, timeSeconds: number, opts: TotpOptions = {}): string {
  return hotp(secret, counterFor(timeSeconds, opts), opts);
}

/**
 * Constant-time comparison of two numeric codes. Length is compared first,
 * which is safe: a wrong-length code carries no secret prefix.
 */
function codesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a.padStart(10, " "));
  const right = Buffer.from(b.padStart(10, " "));
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks a submitted code against the current step plus `window` steps either
 * side. A small window is required because the phone's clock and ours differ,
 * but every extra step is extra attempts for an attacker, so the default is 1.
 */
export function verifyTotp(
  secret: string,
  token: string,
  opts: TotpOptions & { window?: number; now?: number } = {}
): { ok: boolean; counter: number } {
  const { digits = DEFAULTS.digits, window = 1, now = Math.floor(Date.now() / 1000) } = opts;
  const code = String(token ?? "").trim();
  // Exactly the digits a code of this length has, and no more. Rejecting anything
  // else up front keeps non-numeric input from being run through the HMAC at
  // all. The count is derived from the same option that produced the code, so a
  // deployment configured for 8 digits still verifies 8 and does not silently
  // accept the 6-to-8 range it never issues.
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return { ok: false, counter: -1 };

  const current = counterFor(now, opts);
  let matched = -1;
  for (let offset = -window; offset <= window; offset++) {
    const counter = current + offset;
    if (counter < 0) continue;
    if (codesMatch(hotp(secret, counter, opts), code)) matched = counter;
  }
  return { ok: matched >= 0, counter: matched };
}

// ----------------------------------------------------------------- provisioning

export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/**
 * The otpauth:// URI every authenticator app scans. Issuer must match the
 * label shown in the app, or the entry is filed under the wrong account.
 */
export function otpauthUrl(opts: {
  secret: string;
  account: string;
  issuer: string;
  digits?: number;
  algorithm?: TotpAlgorithm;
}): string {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: (opts.algorithm ?? "SHA1").toUpperCase(),
    digits: String(opts.digits ?? 6),
    period: String(DEFAULTS.step),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// -------------------------------------------------------------------- at rest

const CIPHER = "aes-256-gcm";
const VERSION = "v1";

/**
 * The TOTP secret has to be recoverable, because generating the next code needs
 * it. That rules out hashing it the way a password is hashed, so it is instead
 * encrypted with AES-256-GCM: a database dump on its own is not enough to
 * impersonate the account.
 *
 * Key resolution, in order:
 *   1. TOTP_ENCRYPTION_KEY, 32 bytes as 64 hex chars or base64.
 *   2. Derived from AUTH_SECRET with a domain-separating HMAC, so a deployment
 *      that already has AUTH_SECRET configured is protected without extra setup.
 * If neither exists, 2FA cannot be enabled.
 */
function encryptionKey(): Buffer | null {
  const explicit = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (/^[0-9a-f]{64}$/i.test(explicit)) return Buffer.from(explicit, "hex");
    const fromB64 = Buffer.from(explicit, "base64");
    if (fromB64.length === 32) return fromB64;
    throw new Error(
      "TOTP_ENCRYPTION_KEY must be 32 bytes, written as 64 hex characters or base64."
    );
  }
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (authSecret) {
    return createHmac("sha256", authSecret).update("orkut/totp-encryption-key/v1").digest();
  }
  return null;
}

export function encryptionConfigured(): boolean {
  return encryptionKey() !== null;
}

/** Storage form: "v1.<iv b64url>.<ciphertext b64url>.<tag b64url>". */
export function encryptSecret(plain: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("No encryption key configured for TOTP secrets");
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), enc.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const key = encryptionKey();
  if (!key) throw new Error("No encryption key configured for TOTP secrets");
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised stored TOTP secret");
  }
  const decipher = createDecipheriv(CIPHER, key, Buffer.from(parts[1], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2], "base64url")),
    decipher.final(),
  ]).toString("utf8");
}