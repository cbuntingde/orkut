// Password policy, following NIST SP 800-63B: length plus a blocklist, and no
// composition rules. Requiring "one capital, one digit, one symbol" reliably
// produces Password1!, which is weaker than a long passphrase. Length and a
// blocklist is the guidance, so that is what this enforces.

const COMMON = [
  "password", "passwd", "123456", "12345678", "123456789", "qwerty", "qwertyuiop",
  "abc123", "letmein", "welcome", "monkey", "dragon", "iloveyou", "sunshine",
  "princess", "football", "baseball", "shadow", "superman", "trustno1",
  "starwars", "whatever", "freedom", "ninja", "azerty", "login", "admin",
  "orkut", "orkut123", "recado", "recados",
];

export const MIN_LENGTH = 12;
export const MIN_MAX = 200;

// Returns a list of problems. Empty means acceptable.
export function passwordProblems(
  password: string,
  ctx: { name?: string; email?: string } = {},
): string[] {
  const problems: string[] = [];

  if (password.length < MIN_LENGTH) {
    problems.push(`Use at least ${MIN_LENGTH} characters.`);
  }
  if (password.length > MIN_MAX) {
    problems.push(`Keep it under ${MIN_MAX} characters.`);
  }

  const lower = password.toLowerCase();

  if (COMMON.some((c) => lower.includes(c))) {
    problems.push("That contains a very common password.");
  }

  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) {
    problems.push("Don't use your email in your password.");
  }

  const parts = (ctx.name ?? "").toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  if (parts.some((p) => lower.includes(p))) {
    problems.push("Don't use your name in your password.");
  }

  // Repeated single character, eg "aaaaaaaaaaaa"
  if (/^(.)\1+$/.test(password)) {
    problems.push("That's one character repeated.");
  }

  // Sequential runs, eg "123456789012"
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwerty)/.test(lower)) {
    problems.push("Avoid keyboard or number sequences.");
  }

  return problems;
}

// 0 to 4, for the strength meter in the signup form.
export function strengthScore(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_LENGTH) score++;
  if (password.length >= MIN_LENGTH + 6) score++;
  if (password.length >= MIN_LENGTH + 12) score++;

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes >= 2) score++;
  if (classes >= 3) score++;

  return Math.min(4, score);
}

export function strengthLabel(score: number): string {
  return ["", "weak", "fair", "good", "strong"][score] ?? "";
}