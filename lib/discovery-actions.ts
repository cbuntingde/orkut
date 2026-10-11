"use server";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { friendships, users } from "@/drizzle/schema";

// Friends-of-friends not yet connected — Orkut's core discovery ("I met most friends through friends of friends" — Büyükkökten).
export async function getFriendSuggestions(limit = 8) {
  const me = await requireUser();
  // my accepted friend ids
  const mine = await db.select().from(friendships).where(
    or(
      and(eq(friendships.requesterId, me.id), eq(friendships.status, "accepted")),
      and(eq(friendships.addresseeId, me.id), eq(friendships.status, "accepted"))
    )
  );
  const myIds = new Set(mine.map((f) => (f.requesterId === me.id ? f.addresseeId : f.requesterId)));
  if (!myIds.size) {
    // no friends yet: suggest newest users
    return db.select().from(users).where(ne(users.id, me.id)).orderBy(desc(users.createdAt)).limit(limit)
      .then((rows) => rows.map((u) => ({ user: u, mutual: 0 })));
  }
  const ids = [...myIds];
  // friends of my friends (accepted), excluding me + my friends
  const fof = await db.select().from(friendships).where(
    or(
      sql`${friendships.requesterId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
      sql`${friendships.addresseeId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
    )
  ).limit(200);
  const counts = new Map<string, number>();
  for (const f of fof) {
    if (f.status !== "accepted") continue;
    for (const cand of [f.requesterId, f.addresseeId]) {
      if (cand === me.id || myIds.has(cand)) continue;
      counts.set(cand, (counts.get(cand) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  return Promise.all(ranked.map(async ([id, mutual]) => ({
    user: (await db.select().from(users).where(eq(users.id, id)).limit(1))[0],
    mutual,
  }))).then((r) => r.filter((x) => x.user));
}
