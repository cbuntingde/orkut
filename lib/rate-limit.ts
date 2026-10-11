import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/drizzle/schema";

export type RateResult = { ok: boolean; count: number; retryAfterSec: number };

// A row is created on first touch and the counter resets in place, so nothing ever
// removed old rows and the table grew with every distinct IP and email that was
// ever tried. Spraying unique addresses grew it for free. Housekeeping now runs
// roughly once every 500 calls, which needs no scheduler and no extra process.
let sincePrune = 0;
const PRUNE_EVERY = 500;

async function maybePrune(): Promise<void> {
  if (++sincePrune < PRUNE_EVERY) return;
  sincePrune = 0;
  try {
    await db.delete(rateLimits).where(sql`${rateLimits.windowStart} < NOW() - INTERVAL '1 day'`);
  } catch {
    // Housekeeping must never be the reason a login fails.
  }
}

// Fixed-window counter backed by Postgres, so the limit survives a restart and is
// shared across processes. The upsert resets the window inline, which keeps the
// whole check-and-increment atomic without a transaction.
export async function hit(key: string, limit: number, windowSeconds: number): Promise<RateResult> {
  void maybePrune();
  const rows = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: new Date() })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} < NOW() - (${windowSeconds} * INTERVAL '1 second')
                       THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} < NOW() - (${windowSeconds} * INTERVAL '1 second')
                              THEN NOW() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  const row = rows[0];
  const count = Number(row.count);
  const elapsed = Date.now() - new Date(row.windowStart).getTime();
  const retryAfterSec = Math.max(0, Math.ceil((windowSeconds * 1000 - elapsed) / 1000));
  return { ok: count <= limit, count, retryAfterSec };
}

export async function pruneRateLimits(): Promise<number> {
  const deleted = await db.delete(rateLimits).where(sql`${rateLimits.windowStart} < NOW() - INTERVAL '1 day`).returning({ key: rateLimits.key });
  return deleted.length;
}

// Read without consuming budget. Used to clear a counter after a success.
export async function peek(key: string): Promise<RateResult> {
  const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  if (!rows.length) return { ok: true, count: 0, retryAfterSec: 0 };
  const elapsed = Date.now() - new Date(rows[0].windowStart).getTime();
  const retryAfterSec = Math.max(0, Math.ceil((3600 * 1000 - elapsed) / 1000));
  return { ok: true, count: rows[0].count, retryAfterSec };
}

export async function clear(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

// Best-effort IP for the throttle key. Behind a proxy the first entry is the
// client; locally it falls back to a constant so the limit still applies.
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return headers.get("x-real-ip")?.slice(0, 64) ?? "local";
}