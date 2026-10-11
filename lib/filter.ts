// Spam gate, NOT a profanity filter.
//
// This list is deliberately tiny. Every word in it is unambiguous commercial spam
// with no legitimate reading. Words like "casino", "spam", "scam" and "phishing"
// were in the previous list and were wrong: Orkut users argued about phishing
// awareness and wrote about casinos constantly, and a social network that blocks
// the word "spam" cannot host a conversation about spam.
//
// A vocabulary list is a weak filter by construction. Orkut's real defence was the
// jail system, where aggregated reports produced temporary restrictions. That is
// the P3 work (rate limiting plus the jail), not this file.

const SPAM_TERMS = ["viagra", "crypto-doubler"];

export function findSpamTerm(text: string): string | null {
  const lower = text.toLowerCase();
  for (const term of SPAM_TERMS) {
    if (lower.includes(term)) return term;
  }
  return null;
}

export function assertNoSpam(text: string, what = "Content") {
  const hit = findSpamTerm(text);
  if (hit) throw new Error(`${what} blocked: flagged term "${hit}".`);
}