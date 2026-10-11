// Mail transport selection.
//
// The point of these checks is the production guard. The console transport
// writes verification links to the server log instead of sending them, so a
// production deployment using it has an application nobody can complete signup
// on — and no error to show for it. That guard used to sit only on the inferred
// path, so naming it explicitly was a way straight past it.
//
// Run: node --experimental-strip-types .\scripts\verify-mail-provider.ts
import { resolveProviderName } from "../lib/mail/types.ts";

// The real process environment is not read here: passing an explicit env keeps
// these checks deterministic and lets both production and development settings
// be exercised in one run.
function withEnv(env: Record<string, string>, fn: () => void) {
  const saved = { ...process.env };
  for (const key of ["MAIL_PROVIDER", "RESEND_API_KEY", "POSTMARK_SERVER_TOKEN", "AWS_REGION", "AWS_ACCESS_KEY_ID", "SMTP_HOST", "NODE_ENV"]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
}

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${String(got)} want=${String(want)}`}`);
}

function resolved(env: Record<string, string>): string {
  let out = "no-throw";
  withEnv(env, () => {
    try {
      out = resolveProviderName();
    } catch (err) {
      // The full message, because some checks assert on what it says rather
      // than merely on the fact that it threw.
      out = `threw: ${(err as Error).message}`;
    }
  });
  return out;
}

// --- development ------------------------------------------------------------
{
  check("dev with no config falls back to console", resolved({ NODE_ENV: "development" }), "console");
  check("dev can name console", resolved({ NODE_ENV: "development", MAIL_PROVIDER: "console" }), "console");
  check("dev honours an explicit smtp", resolved({ NODE_ENV: "development", MAIL_PROVIDER: "smtp" }), "smtp");
  check("dev infers resend from a key", resolved({ NODE_ENV: "development", RESEND_API_KEY: "re_x" }), "resend");
  check("dev infers postmark from a token", resolved({ NODE_ENV: "development", POSTMARK_SERVER_TOKEN: "pm_x" }), "postmark");
  check("dev infers smtp from a host", resolved({ NODE_ENV: "development", SMTP_HOST: "smtp.example.com" }), "smtp");
}

// --- production -------------------------------------------------------------
{
  // The regression this file exists for: naming it explicitly used to skip the
  // guard and silently swallow every verification mail.
  const explicit = resolved({ NODE_ENV: "production", MAIL_PROVIDER: "console" });
  check("production refuses an explicit console", explicit.startsWith("threw:"), true);
  check(
    "the refusal names the offending setting",
    explicit.includes("MAIL_PROVIDER=console"),
    true
  );
  check(
    "the refusal names the alternatives",
    ["resend", "postmark", "ses", "smtp"].every((p) => explicit.includes(p)),
    true
  );

  check("production with no transport throws", resolved({ NODE_ENV: "production" }).startsWith("threw:"), true);
  check("production still allows smtp", resolved({ NODE_ENV: "production", MAIL_PROVIDER: "smtp" }), "smtp");
  check(
    "production still infers resend",
    resolved({ NODE_ENV: "production", RESEND_API_KEY: "re_x" }),
    "resend"
  );

  // Case-insensitive, so CONSOLE is caught by the same guard.
  check("production refuses CONSOLE in caps", resolved({ NODE_ENV: "production", MAIL_PROVIDER: "CONSOLE" }).startsWith("threw:"), true);
}

// --- configuration errors stay loud -----------------------------------------
{
  check(
    "unknown provider is an error, not a fallback",
    resolved({ NODE_ENV: "production", MAIL_PROVIDER: "sendgrid" }).startsWith("threw:"),
    true
  );
}

console.log(failures === 0 ? "\nAll mail-provider checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);