import { and, desc, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/drizzle/schema";
import { SESSION_COOKIE } from "@/lib/auth";

// Per-device session management. Each session row carries the browser's
// user-agent string and IP so a user can recognise a login that is not theirs.
// "Log out this device" and "log out everywhere else" both act on rows here,
// and neither can touch another account's sessions.

export type SessionView = {
  id: string;
  /** Human-readable summary such as "Chrome on Windows". */
  device: string;
  browser: string;
  platform: string;
  ip: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  current: boolean;
};

// Ordered by recency so the newest login is the first thing read.
export async function listSessions(userId: string): Promise<SessionView[]> {
  const jar = await cookies();
  const currentToken = jar.get(SESSION_COOKIE)?.value ?? null;

  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt));

  return rows.map((row) => ({
    id: row.id,
    ...describe(row.userAgent),
    ip: row.ip,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    current: row.token === currentToken,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  // userId is part of the WHERE clause on purpose: a guessed session id belonging
  // to someone else must match nothing.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));
}

export async function revokeOtherSessions(userId: string): Promise<string | null> {
  const jar = await cookies();
  const currentToken = jar.get(SESSION_COOKIE)?.value ?? null;
  await db.delete(sessions).where(
    currentToken
      ? and(eq(sessions.userId, userId), ne(sessions.token, currentToken))
      : eq(sessions.userId, userId)
  );
  return currentToken;
}

// ------------------------------------------------------------------ user agents

const BROWSERS: [RegExp, string][] = [
  [/edg[ea]?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/samsungbrowser/i, "Samsung Internet"],
  [/firefox\/|fxios\//i, "Firefox"],
  [/chrome\/|crios\//i, "Chrome"],
  [/safari\//i, "Safari"],
  [/msie |trident\//i, "Internet Explorer"],
];

const PLATFORMS: [RegExp, string][] = [
  [/windows/i, "Windows"],
  [/iphone|ipad|ipod|ios/i, "iOS"],
  [/mac os x|macintosh/i, "macOS"],
  [/android/i, "Android"],
  [/linux/i, "Linux"],
  [/cros/i, "ChromeOS"],
];

/**
 * Reduces a user-agent string to something a person would recognise. The raw
 * string is long, noisy, and its only value here is the device label.
 */
export function describe(userAgent: string | null): { device: string; browser: string; platform: string } {
  if (!userAgent) return { device: "Unknown device", browser: "Unknown", platform: "Unknown" };

  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? "Unknown browser";
  const platform = PLATFORMS.find(([re]) => re.test(userAgent))?.[1] ?? "Unknown platform";
  return { device: `${browser} on ${platform}`, browser, platform };
}

/** "just now", "12 minutes ago", "3 days ago". */
export function relativeTime(then: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];
  let value = seconds / 60;
  let label = "minute";
  for (const [factor, unit] of units) {
    if (value < factor) break;
    value = value / factor;
    label = unit;
  }
  const n = Math.floor(value);
  if (label === "month") {
    return n < 12 ? `${n} month${n === 1 ? "" : "s"} ago` : `${Math.floor(n / 12)} years ago`;
  }
  return `${n} ${label}${n === 1 ? "" : "s"} ago`;
}