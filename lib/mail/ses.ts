import type { MailMessage, MailProvider, MailResult } from "./types";
import { env } from "./types";

type SesModule = {
  SESv2Client: new (cfg: { region: string }) => {
    send(cmd: unknown): Promise<{ MessageId?: string }>;
    destroy(): void;
  };
  SendEmailCommand: new (input: unknown) => unknown;
};

// Built at runtime so the bundler cannot statically resolve it. The AWS SDK is
// not a dependency of this project, and a literal specifier here would make
// every build emit a module-not-found warning even when SES is never used.
const SES_MODULE = ["@aws-sdk", "client-sesv2"].join("/");

/**
 * Amazon SES v2. The AWS SDK is NOT a hard dependency: it is several megabytes
 * and most people deploying this will use Resend or Postmark instead. It is
 * imported only when SES is actually selected, and if it is missing the error
 * says exactly which package to install.
 */
export const sesProvider: MailProvider = {
  name: "ses",
  async send(msg: MailMessage): Promise<MailResult> {
    let mod: SesModule;
    try {
      mod = (await import(/* webpackIgnore: true */ SES_MODULE)) as unknown as SesModule;
    } catch {
      return {
        ok: false,
        provider: "ses",
        error: "The AWS SDK is not installed. Run: npm i @aws-sdk/client-sesv2",
      };
    }

    const region = env("AWS_REGION") ?? "us-east-1";
    const client = new mod.SESv2Client({ region });

    try {
      const res = await client.send(
        new mod.SendEmailCommand({
          FromEmailAddress: env("MAIL_FROM") ?? "no-reply@orkut.local",
          Destination: { ToAddresses: [msg.to] },
          Content: {
            Simple: {
              Subject: { Data: msg.subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: msg.text, Charset: "UTF-8" },
                ...(msg.html ? { Html: { Data: msg.html, Charset: "UTF-8" } } : {}),
              },
            },
          },
        })
      );
      return { ok: true, id: res.MessageId };
    } catch (e: unknown) {
      return { ok: false, provider: "ses", error: e instanceof Error ? e.message : "unknown error" };
    } finally {
      client.destroy();
    }
  },
};