import type { MailMessage, MailProvider, MailResult, ProviderName } from "./types";
import { resolveProviderName } from "./types";
import { consoleProvider } from "./console";
import { resendProvider } from "./resend";
import { postmarkProvider } from "./postmark";
import { sesProvider } from "./ses";
import { smtpProvider } from "./smtp";

export * from "./types";
export { consoleProvider, resendProvider, postmarkProvider, sesProvider, smtpProvider };

const REGISTRY: Record<ProviderName, MailProvider> = {
  console: consoleProvider,
  resend: resendProvider,
  postmark: postmarkProvider,
  ses: sesProvider,
  smtp: smtpProvider,
};

export function getProvider(): MailProvider {
  return REGISTRY[resolveProviderName()];
}

export function sendMail(msg: MailMessage): Promise<MailResult> {
  return getProvider().send(msg);
}