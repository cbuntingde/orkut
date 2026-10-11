import type { MailMessage, MailProvider, MailResult } from "./types";
import { env } from "./types";

const ENDPOINT = "https://api.postmarkapp.com/email";

export const postmarkProvider: MailProvider = {
  name: "postmark",
  async send(msg: MailMessage): Promise<MailResult> {
    const token = env("POSTMARK_SERVER_TOKEN");
    if (!token) {
      return { ok: false, provider: "postmark", error: "POSTMARK_SERVER_TOKEN is not set" };
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": token,
        },
        body: JSON.stringify({
          From: env("MAIL_FROM") ?? "orkut@localhost",
          To: msg.to,
          Subject: msg.subject,
          TextBody: msg.text,
          ...(msg.html ? { HtmlBody: msg.html } : {}),
          MessageStream: env("POSTMARK_MESSAGE_STREAM") ?? "outbound",
        }),
      });
      if (!res.ok) {
        return { ok: false, provider: "postmark", error: `postmark ${res.status}: ${await res.text()}` };
      }
      const data = (await res.json()) as { MessageID?: string };
      return { ok: true, id: data.MessageID };
    } catch (e: unknown) {
      return { ok: false, provider: "postmark", error: e instanceof Error ? e.message : "unknown error" };
    }
  },
};