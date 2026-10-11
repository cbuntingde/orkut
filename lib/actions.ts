"use server";
import { revalidatePath } from "next/cache";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fans, friendships, ratings, scraps, testimonials, users } from "@/drizzle/schema";
import { isBlocked } from "@/lib/safety-actions";
import { assertNoSpam } from "@/lib/filter";
import { notify, assertNotJailed, areFriends } from "@/lib/notify";

/**
 * The only profile columns a client may write.
 *
 * This list is the security control, not documentation. A Next.js server action
 * is a public HTTP endpoint: the parameter type below is erased at runtime, so
 * the object actually received is whatever the caller sent. Spreading that
 * object into `.set()` handed every `users` column to the account owner, because
 * Drizzle builds the SET clause from the real table columns and applies any of
 * them present in the object — see `buildUpdateSet` in
 * `node_modules/drizzle-orm/pg-core/dialect.cjs`. That made `emailVerifiedAt`,
 * `jailedUntil`, `passwordHash` and `totpSecret` all settable on one's own row.
 *
 * The WHERE clause scopes the row. It never scopes the columns.
 */
const EDITABLE_PROFILE_FIELDS = [
  "status", "relationship", "city", "country",
  "about", "interests", "music", "movies", "books", "avatarUrl",
] as const;

export async function updateProfile(form: {
  status?: string; relationship?: string; city?: string; country?: string;
  about?: string; interests?: string; music?: string; movies?: string; books?: string; avatarUrl?: string; dob?: string;
}) {
  const me = await requireUser();
  assertNoSpam(
    [form.status, form.about, form.interests, form.music, form.movies, form.books]
      .filter(Boolean).join(" "),
    "Profile"
  );

  // Copied field by field, and only when the value really is a string. Anything
  // absent, null, or of another type is simply not written, so clearing a field
  // still sends "" and clears it, while a non-string injection is dropped.
  //
  // Typed as a Pick of the insert shape rather than a hand-written record, so
  // each field keeps the type its column actually expects instead of collapsing
  // every one of them to `string`.
  type EditableProfilePatch = Partial<
    Pick<typeof users.$inferInsert, (typeof EDITABLE_PROFILE_FIELDS)[number]> & { dob: Date | null }
  >;
  const patch: EditableProfilePatch = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    const value = form[field];
    if (typeof value === "string") patch[field] = value;
  }

  // The birthday is editable too, but it is a date rather than a string, so it
  // gets its own explicitly named case instead of riding the loop above. A blank
  // or unparseable value clears it; a malformed one would otherwise reach
  // Postgres as an Invalid Date.
  if (typeof form.dob === "string") {
    const trimmed = form.dob.trim();
    if (trimmed === "") {
      patch.dob = null;
    } else {
      const parsed = new Date(trimmed);
      patch.dob = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  // Drizzle throws "No values to set" on an empty SET clause, so a caller that
  // sent nothing usable has to be a no-op rather than a 500. The previous
  // version could not hit this because it always wrote `dob`.
  if (Object.keys(patch).length === 0) return;

  await db.update(users).set(patch).where(eq(users.id, me.id));
  revalidatePath(`/profile/${me.id}`);
  revalidatePath("/home");
}

export async function addFriend(addresseeId: string) {
  const me = await requireUser();
  if (addresseeId === me.id) return;
  if (await isBlocked(addresseeId, me.id)) throw new Error("You can't add this user (blocked).");
  const existing = await db.select().from(friendships).where(
    or(
      and(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, addresseeId)),
      and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, me.id))
    )
  ).limit(1);
  if (existing.length) return;
  await db.insert(friendships).values({ requesterId: me.id, addresseeId, status: "pending" });
  await notify({ userId: addresseeId, kind: "friend_request", actorId: me.id, targetId: me.id });
  revalidatePath(`/profile/${addresseeId}`);
}

export async function acceptFriend(requesterId: string) {
  const me = await requireUser();
  await db.update(friendships).set({ status: "accepted" }).where(
    and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, me.id))
  );
  await notify({ userId: requesterId, kind: "friend_accept", actorId: me.id, targetId: me.id });
  revalidatePath("/friends");
}

export async function declineFriend(requesterId: string) {
  const me = await requireUser();
  await db.delete(friendships).where(
    and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, me.id), eq(friendships.status, "pending"))
  );
  revalidatePath("/friends");
}

export async function removeFriend(otherId: string) {
  const me = await requireUser();
  await db.delete(friendships).where(
    or(
      and(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, otherId)),
      and(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, me.id))
    )
  );
  revalidatePath("/friends");
  revalidatePath(`/profile/${otherId}`);
}

export async function toggleFan(starId: string) {
  const me = await requireUser();
  // Orkut restricted fans and testimonials to people in your friend list.
  if (!(await areFriends(me.id, starId))) throw new Error("You can only fan people who are your friends");
  const rows = await db.select().from(fans).where(and(eq(fans.fanId, me.id), eq(fans.starId, starId))).limit(1);
  if (rows.length) await db.delete(fans).where(and(eq(fans.fanId, me.id), eq(fans.starId, starId)));
  else await db.insert(fans).values({ fanId: me.id, starId });
  revalidatePath(`/profile/${starId}`);
  revalidatePath("/fans");
}

const RATING_FIELDS = ["cool", "sexy", "trustworthy"] as const;

export async function rateUser(ratedId: string, field: string, value: number) {
  const me = await requireUser();
  // The column is chosen at runtime, so it is checked rather than trusted. The
  // declared parameter type is erased on the wire, and a computed key that is
  // not a real column is exactly what the allowlist in updateProfile exists to
  // stop elsewhere.
  if (!(RATING_FIELDS as readonly string[]).includes(field)) {
    throw new Error("Unknown rating field");
  }
  const v = Math.max(0, Math.min(3, Math.round(value)));
  await db.insert(ratings).values({ raterId: me.id, ratedId, [field]: v } as typeof ratings.$inferInsert)
    .onConflictDoUpdate({ target: [ratings.raterId, ratings.ratedId], set: { [field]: v } });
  revalidatePath(`/profile/${ratedId}`);
}

// Orkut sorted friendships by closeness rather than just tracking who is a friend.
export async function setFriendTier(otherId: string, tier: "acquaintance" | "good" | "best") {
  const me = await requireUser();
  const before = await db.select().from(friendships).where(
    or(
      and(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, otherId)),
      and(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, me.id))
    )
  ).limit(1);
  if (!before.length) throw new Error("You can only rank people who are your friends");
  await db.update(friendships).set({ tier }).where(eq(friendships.id, before[0].id));
  revalidatePath("/friends");
  revalidatePath(`/profile/${me.id}`);
}

export async function postScrap(ownerId: string, body: string, isPrivate = false) {
  const me = await requireUser();
  await assertNotJailed(me.id);
  // Orkut's flood defence: a modest per-hour ceiling on top of the content gate.
  const { hit } = await import("@/lib/rate-limit");
  const cap = await hit(`scrap:${me.id}`, 30, 60 * 60);
  if (!cap.ok) throw new Error("You are scrapping too fast. Take a break for a moment.");
  const clean = body.trim().slice(0, 1000);
  if (!clean) throw new Error("Scrap is empty");
  assertNoSpam(clean, "Scrap");
  if (await isBlocked(ownerId, me.id)) throw new Error("You can't scrap this user (blocked).");
  await db.insert(scraps).values({ authorId: me.id, ownerId, body: clean, isPrivate });
  await db.update(users).set({ scrapsCount: sql`${users.scrapsCount} + 1` }).where(eq(users.id, ownerId));
  await notify({
    userId: ownerId,
    kind: "scrap",
    actorId: me.id,
    targetId: clean.slice(0, 60),
    body: clean.slice(0, 80),
  });
  revalidatePath(`/profile/${ownerId}`);
  revalidatePath("/notifications");
}

export async function deleteScrap(scrapId: string, ownerId: string) {
  const me = await requireUser();
  const rows = await db.select().from(scraps).where(eq(scraps.id, scrapId)).limit(1);
  const s = rows[0];
  if (!s) return;
  if (s.ownerId !== me.id && s.authorId !== me.id) throw new Error("Not allowed");
  await db.delete(scraps).where(eq(scraps.id, scrapId));
  // Keep the counter in step with the rows, otherwise it only ever drifts upward.
  await db.update(users).set({ scrapsCount: sql`GREATEST(${users.scrapsCount} - 1, 0)` }).where(eq(users.id, s.ownerId));
  revalidatePath(`/profile/${ownerId}`);
}

export async function writeTestimonial(subjectId: string, body: string) {
  const me = await requireUser();
  await assertNotJailed(me.id);
  // Orkut testimonials were endorsements between friends, not open submissions.
  if (!(await areFriends(me.id, subjectId))) {
    throw new Error("You can only write testimonials for your friends");
  }
  const clean = body.trim();
  if (clean.length < 5) throw new Error("Testimonial too short");
  assertNoSpam(clean, "Testimonial");
  await db.insert(testimonials).values({ authorId: me.id, subjectId, body: clean, status: "pending" });
  await notify({ userId: subjectId, kind: "testimonial", actorId: me.id, body: clean.slice(0, 80) });
  revalidatePath(`/profile/${subjectId}`);
}

export async function moderateTestimonial(id: string, decision: "accepted" | "rejected") {
  const me = await requireUser();
  await db.update(testimonials).set({ status: decision }).where(and(eq(testimonials.id, id), eq(testimonials.subjectId, me.id)));
  revalidatePath(`/profile/${me.id}`);
}
