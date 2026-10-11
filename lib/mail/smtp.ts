import type { MailMessage, MailProvider, MailResult } from "./types";
import { env } from "./types";

/**
 * Plain SMTP, the most universal transport and usually what a self-hosted
 * deployment has. nodemailer is imported lazily so it is only loaded when SMTP is
 * the selected provider.
 */
export const smtpProvider: MailProvider = {
  name: "smtp",
  async send(msg: MailMessage): Promise<MailResult> {
    const host = env("SMTP_HOST");
    if (!host) return { ok: false, provider: "smtp", error: "SMTP_HOST is not set" };

    let nodemailer: typeof import("nodemailer");
    try {
      nodemailer = (await import("nodemailer")).default as unknown as typeof import("nodemailer");
    } catch {
      return {
        ok: false,
        provider: "smtp",
        error: "nodemailer is not installed. Run: npm i nodemailer",
      };
    }

    const port = Number(env("SMTP_PORT") ?? "587");
    const secure = env("SMTP_SECURE")
      ? env("SMTP_SECURE") === "true"
      : port === 465;

    try {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        ...(env("SMTP_USER")
          ? { auth: { user: env("SMTP_USER"), pass: env("SMTP_PASSWORD") ?? "" } }
          : {}),
      });
      const info = await transport.sendMail({
        from: env("MAIL_FROM") ?? "orkut <no-reply@orkut.local>",
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      });
      return { ok: true, id: info.messageId };
    } catch (e: unknown) {
      return { ok: false, provider: "smtp", error: e instanceof Error ? e.message : "unknown error" };
    }
  },
};