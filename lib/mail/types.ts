export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; provider: string };

export interface MailProvider {
  readonly name: string;
  send(msg: MailMessage): Promise<MailResult>;
}

export type ProviderName = "console" | "resend" | "postmark" | "ses" | "smtp";

export const PROVIDER_NAMES: ProviderName[] = ["console", "resend", "postmark", "ses", "smtp"];

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Chooses a provider. An explicit MAIL_PROVIDER always wins; otherwise the first
 * transport with usable credentials is inferred, so a developer who drops in one
 * API key does not also have to set the selector.
 *
 * Falls back to `console`, which logs the message instead of sending it. That is
 * deliberate for local development, and it is refused in production so a deploy
 * can never silently discard verification mail.
 */
export function resolveProviderName(): ProviderName {
  const explicit = env("MAIL_PROVIDER")?.toLowerCase();
  if (explicit) {
    if (!PROVIDER_NAMES.includes(explicit as ProviderName)) {
      throw new Error(
        `Unknown MAIL_PROVIDER "${explicit}". Use one of: ${PROVIDER_NAMES.join(", ")}.`
      );
    }
    return explicit as ProviderName;
  }

  if (env("RESEND_API_KEY")) return "resend";
  if (env("POSTMARK_SERVER_TOKEN")) return "postmark";
  if (env("AWS_REGION") && (env("AWS_ACCESS_KEY_ID") || env("AWS_PROFILE"))) return "ses";
  if (env("SMTP_HOST")) return "smtp";

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No mail transport configured. Set MAIL_PROVIDER to resend, postmark, ses or smtp, " +
        "and the matching credentials. The console provider is refused in production " +
        "so verification mail cannot be silently discarded."
    );
  }
  return "console";
}