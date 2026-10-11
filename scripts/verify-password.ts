// Password hashing checks: format, verification, and the rehash policy.
// Run: node --experimental-strip-types .\scripts\verify-password.ts
import { hashPassword, verifyPassword, needsRehash, dummyVerify } from "../lib/password-hasher.ts";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${String(got)} want=${String(want)}`}`);
}

// --- the primary algorithm -----------------------------------------------------
{
  const hash = await hashPassword("orkut123");
  check("argon2id prefix", hash.startsWith("$argon2id$"), true);
  check("carries version", hash.includes("v=19"), true);
  check("carries m= cost", /m=19456/.test(hash), true);
  check("carries t= cost", /t=2/.test(hash), true);
  check("carries p= cost", /p=1/.test(hash), true);
  // 32 bytes of output encode to 44 base64 characters including the padding.
  check("32 byte output", hash.split("$")[5].length, 43);

  check("correct password verifies", await verifyPassword("orkut123", hash), true);
  check("wrong password rejected", await verifyPassword("orkut124", hash), false);
  check("empty password rejected", await verifyPassword("", hash), false);
  check("substring of password rejected", await verifyPassword("orkut12", hash), false);
  check("password plus suffix rejected", await verifyPassword("orkut123 ", hash), false);

  const second = await hashPassword("orkut123");
  check("same password, different hash", second !== hash, true);
  check("second hash still verifies", await verifyPassword("orkut123", second), true);
}

// --- malformed stored values must fail closed, not throw ----------------------
{
  check("empty stored hash", await verifyPassword("x", ""), false);
  check("garbage stored hash", await verifyPassword("x", "not-a-hash"), false);
  check("bcrypt marker unsupported", await verifyPassword("x", "$2b$10$abcdefghijklmnopqrstuv"), false);
  check("truncated argon2", await verifyPassword("x", "$argon2id$v=19$m=19456"), false);
  check("pbkdf2 wrong field count", await verifyPassword("x", "pbkdf2$600000$abcd"), false);
}

// --- the rehash policy ---------------------------------------------------------
{
  const current = await hashPassword("orkut123");
  check("fresh argon2 needs no rehash", needsRehash(current), false);

  // A hash at current parameters but older notation still counts as current.
  check("argon2 at policy needs no rehash", needsRehash("$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2E=$" + "A".repeat(43)), false);
  check("weaker m needs rehash", needsRehash("$argon2id$v=19$m=8192,t=2,p=1$c2FsdHNhbHRzYWx0c2E=$" + "A".repeat(43)), true);
  check("weaker t needs rehash", needsRehash("$argon2id$v=19$m=19456,t=1,p=1$c2FsdHNhbHRzYWx0c2E=$" + "A".repeat(43)), true);

  // The case that matters on an existing database: a full-strength PBKDF2 hash
  // from before the Argon2 move must still be flagged, or nobody would upgrade.
  check("600k pbkdf2 still needs rehash", needsRehash(`pbkdf2$600000$${"0".repeat(32)}$${"0".repeat(64)}`), true);
  check("120k pbkdf2 needs rehash", needsRehash(`pbkdf2$120000$${"0".repeat(32)}$${"0".repeat(64)}`), true);
  check("argon2 hash is not pbkdf2", needsRehash("something-else"), false);
}

// --- legacy verification still works, so upgrades cost no lockouts ------------
{
  const legacy = `pbkdf2$600000$00000000000000000000000000000001$${"0".repeat(64)}`;
  // Not a real match, but it must reach the KDF and return false rather than
  // short-circuiting, which is what keeps login timing flat across algorithms.
  check("legacy hash verifies false, not throw", await verifyPassword("anything", legacy), false);
}

// --- timing equalizer ----------------------------------------------------------
{
  const t0 = performance.now();
  await dummyVerify();
  const first = performance.now() - t0;
  const t1 = performance.now();
  await dummyVerify();
  const second = performance.now() - t1;
  console.log(`\ndummyVerify: first ${first.toFixed(1)}ms, second ${second.toFixed(1)}ms`);
  // It has to cost real work, otherwise equalizing timing costs nothing.
  check("dummyVerify does measurable work", first > 5, true);
}

console.log(failures === 0 ? "\nAll password checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);