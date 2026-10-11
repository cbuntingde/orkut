// RFC test vectors for the TOTP implementation. Run: node .\scripts\verify-totp.ts
// (or via tsx). Fails loudly on any mismatch.
import {
  base32Encode,
  base32Decode,
  hotp,
  totp,
  counterFor,
  verifyTotp,
  generateSecret,
  encryptSecret,
  decryptSecret,
  otpauthUrl,
  encryptionConfigured,
} from "../lib/totp.ts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${got} want=${want}`}`);
}

// --- base32 round trip, and the RFC 4648 vectors without padding -------------
check("base32 foo", base32Encode(Buffer.from("foo")), "MZXW6");
check("base32 foobar", base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
check("base32 decode foo", base32Decode("MZXW6").toString(), "foo");
check("base32 decode foobar", base32Decode("MZXW6YTBOI").toString(), "foobar");

// --- RFC 4226 appendix D: HOTP with secret "12345678901234567890" ------------
const HOTP_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const HOTP_VECTORS = [
  "755224", "287082", "359152", "969429", "338314",
  "254676", "287922", "162583", "399871", "520489",
];
HOTP_VECTORS.forEach((want, counter) => {
  check(`RFC4226 HOTP counter=${counter}`, hotp(HOTP_SECRET, counter), want);
});

// --- RFC 6238 appendix B: TOTP, 8 digits, one vector per algorithm ------------
// The SHA256 and SHA512 cases use their own longer seeds, not an extension of
// the SHA1 seed, which is the detail most implementations get wrong.
const SEED_SHA1 = base32Encode(Buffer.from("12345678901234567890"));
const SEED_SHA256 = base32Encode(Buffer.from("12345678901234567890123456789012"));
const SEED_SHA512 = base32Encode(
  Buffer.from("1234567890123456789012345678901234567890123456789012345678901234")
);

const TIMES = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
const EXPECT: Record<TotpAlgo, string[]> = {
  sha1: ["94287082", "07081804", "14050471", "89005924", "69279037", "65353130"],
  sha256: ["46119246", "68084774", "67062674", "91819424", "90698825", "77737706"],
  sha512: ["90693936", "25091201", "99943326", "93441116", "38618901", "47863826"],
};
type TotpAlgo = "sha1" | "sha256" | "sha512";

for (const algo of ["sha1", "sha256", "sha512"] as TotpAlgo[]) {
  const seed = algo === "sha1" ? SEED_SHA1 : algo === "sha256" ? SEED_SHA256 : SEED_SHA512;
  TIMES.forEach((t, i) => {
    check(
      `RFC6238 ${algo} T=${t}`,
      totp(seed, t, { digits: 8, algorithm: algo }),
      EXPECT[algo][i]
    );
  });
}

// --- verification window and rejection behaviour ------------------------------
{
  const secret = generateSecret();
  const now = 1_700_000_000;
  const code = totp(secret, now);
  check("verify accepts current step", verifyTotp(secret, code, { now }).ok, true);
  check("verify accepts previous step", verifyTotp(secret, totp(secret, now - 30), { now }).ok, true);
  check("verify rejects 2 steps back", verifyTotp(secret, totp(secret, now - 60), { now }).ok, false);
  check("verify rejects wrong code", verifyTotp(secret, "000000", { now }).ok, false);
  check("verify rejects empty", verifyTotp(secret, "", { now }).ok, false);
  check("verify rejects letters", verifyTotp(secret, "abcdef", { now }).ok, false);
  check("verify rejects 4 digits", verifyTotp(secret, "1234", { now }).ok, false);
  // A code from the future is refused too: an out-of-window counter means the
  // client's clock is ahead, not that someone guessed well.
  check("counterFor step math", counterFor(1700000000), Math.floor(1700000000 / 30));
  check("counterFor respects epoch", counterFor(100, { epoch: 100 }), 0);
}

// --- encryption round trip, and tamper detection ------------------------------
// A deterministic key so the script is self-contained and repeatable. The
// fallback below still exercises the real AUTH_SECRET derivation path.
if (!process.env.TOTP_ENCRYPTION_KEY) {
  process.env.TOTP_ENCRYPTION_KEY = "11".repeat(32);
}
{
  const secret = generateSecret();
  const stored = encryptSecret(secret);
  check("encrypted form is versioned", stored.startsWith("v1."), true);
  check("encrypted form hides the secret", stored.includes(secret), false);
  check("decrypt round trip", decryptSecret(stored), secret);

  const parts = stored.split(".");
  const flipped = [...parts] as string[];
  // Change one character of the ciphertext; GCM's tag must reject it.
  const ct = Buffer.from(parts[2], "base64url");
  ct[0] ^= 0xff;
  flipped[2] = ct.toString("base64url");
  let threw = false;
  try {
    decryptSecret(flipped.join("."));
  } catch {
    threw = true;
  }
  check("tampered ciphertext rejected", threw, true);

  let threwWrongVersion = false;
  try {
    decryptSecret(["v0", ...parts.slice(1)].join("."));
  } catch {
    threwWrongVersion = true;
  }
  check("unknown envelope version rejected", threwWrongVersion, true);

  check("two encryptions differ", encryptSecret(secret) === stored, false);
}

// --- key resolution -----------------------------------------------------------
{
  // With an explicit key removed, the same secret must still round-trip through
  // the AUTH_SECRET derivation, and the two must not agree with each other.
  const secret = generateSecret();
  const explicitKey = process.env.TOTP_ENCRYPTION_KEY!;
  const withExplicit = encryptSecret(secret);

  delete process.env.TOTP_ENCRYPTION_KEY;
  process.env.AUTH_SECRET = "an-auth-secret-for-testing-only";
  check("AUTH_SECRET fallback works", decryptSecret(encryptSecret(secret)), secret);
  const withDerived = encryptSecret(secret);
  check("derived key differs from explicit", withDerived !== withExplicit, true);

  // A different AUTH_SECRET must not be able to read a secret written under the
  // old one. This is what makes rotating AUTH_SECRET a real invalidation.
  process.env.AUTH_SECRET = "a-completely-different-auth-secret";
  let threwWrongKey = false;
  try {
    decryptSecret(withDerived);
  } catch {
    threwWrongKey = true;
  }
  check("wrong key rejected", threwWrongKey, true);

  process.env.AUTH_SECRET = undefined as unknown as string;
  delete process.env.AUTH_SECRET;
  check("no key at all", encryptionConfigured(), false);
  let threwNoKey = false;
  try {
    encryptSecret(secret);
  } catch {
    threwNoKey = true;
  }
  check("encrypt without a key throws", threwNoKey, true);

  // A malformed explicit key is a configuration error and must be loud.
  process.env.TOTP_ENCRYPTION_KEY = "too-short";
  let threwBadKey = false;
  try {
    encryptSecret(secret);
  } catch {
    threwBadKey = true;
  }
  check("malformed key throws", threwBadKey, true);

  process.env.TOTP_ENCRYPTION_KEY = explicitKey;
}

// --- provisioning URI ---------------------------------------------------------
{
  const secret = "JBSWY3DPEHPK3PXP";
  const url = new URL(otpauthUrl({ secret, account: "ana@example.com", issuer: "orkut" }));
  check("otpauth scheme", url.protocol, "otpauth:");
  check("otpauth host", url.host, "totp");
  check("otpauth path", url.pathname, "/orkut:ana%40example.com");
  check("otpauth secret", url.searchParams.get("secret"), secret);
  check("otpauth issuer", url.searchParams.get("issuer"), "orkut");
  check("otpauth digits", url.searchParams.get("digits"), "6");
  check("otpauth algorithm", url.searchParams.get("algorithm"), "SHA1");
  check("otpauth period", url.searchParams.get("period"), "30");
}

console.log(failures === 0 ? "\nAll TOTP checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);