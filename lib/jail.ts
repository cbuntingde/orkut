// The jail policy, kept pure and separate from I/O so it can be tested without
// booting Next. Orkut did not ban outright; reported accounts were temporarily
// restricted, which also stops a single malicious report locking someone out.

export type JailDecision = { days: number; reason: string } | null;

// Escalating restrictions. Counts UPHELD reports, not open ones: moderation
// closes a report the moment it acts on it, so counting open reports would make
// the ladder unreachable.
const LADDER: { at: number; days: number }[] = [
  { at: 10, days: 30 },
  { at: 6, days: 7 },
  { at: 3, days: 1 },
];

export function jailDaysFor(upheldReports: number): JailDecision {
  const rung = LADDER.find((r) => upheldReports >= r.at);
  if (!rung) return null;
  return {
    days: rung.days,
    reason:
      rung.days === 1 ? "3 upheld reports" :
      rung.days === 7 ? "6 upheld reports" :
      "10 upheld reports",
  };
}