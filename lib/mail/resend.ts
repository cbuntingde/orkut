import type { MailMessage, MailProvider, MailResult } from "./types";
import { env } from "./types";

const ENDPOINT = "https://api.resend.com/emails";

export const resendProvider: MailProvider = {
  name: "resend",
  async send(msg: MailMessage): Promise<MailResult> {
    const key = env("RESEND_API_KEY");
    if (!key) return { ok: false, provider: "resend", error: "RESEND_API_KEY is not set" };

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env("MAIL_FROM") ?? "orkut <onboarding@resend.dev>",
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          ...(msg.html ? { html: msg.html } : {}),
        }),
      });
      if (!res.ok) {
        return { ok: false, provider: "resend", error: `resend ${res.status}: ${await res.text()}` };
      }
      const data = (await res.json()) as { id?: string };
      return { ok: true, id: data.id };
    } catch (e: unknown) {
      return { ok: false, provider: "resend", error: e instanceof Error ? e.message : "unknown error" };
    }
  },
};