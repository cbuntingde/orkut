"use server";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/community-actions";
import { directMessages, eventRsvps, events } from "@/drizzle/schema";
import { assertNoSpam } from "@/lib/filter";
import { isBlocked } from "@/lib/safety-actions";

export async function createEvent(communityId: string, form: { title: string; description?: string; location?: string; startsAt: string }) {
  const me = await requireMembership(communityId);
  const title = form.title.trim().slice(0, 200);
  if (title.length < 3) throw new Error("Title too short");
  assertNoSpam(title + " " + (form.description ?? ""), "Event");
  const startsAt = new Date(form.startsAt);
  if (isNaN(+startsAt) || startsAt < new Date()) throw new Error("Pick a future date");
  await db.insert(events).values({
    communityId,
    authorId: me.id,
    title,
    description: form.description?.trim() || null,
    location: form.location?.trim().slice(0, 200) || null,
    startsAt,
  });
  revalidatePath(`/communities/${communityId}`);
}

export async function toggleRsvp(communityId: string, eventId: string) {
  const me = await requireMembership(communityId);
  // The event id is chosen by the caller, so it has to belong to this community
  // rather than to whichever one it happens to name. Without this the
  // communityId argument was only ever used to revalidate a page.
  const owned = await db.select({ id: events.id }).from(events)
    .where(and(eq(events.id, eventId), eq(events.communityId, communityId))).limit(1);
  if (!owned.length) throw new Error("Event not found");

  const existing = await db.select().from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, me.id))).limit(1);
  if (existing.length) {
    await db.delete(eventRsvps).where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, me.id)));
  } else {
    await db.insert(eventRsvps).values({ eventId, userId: me.id, status: "going" });
  }
  revalidatePath(`/communities/${communityId}`);
}

export async function getEvents(communityId: string, viewerId?: string) {
  const list = await db.select().from(events).where(eq(events.communityId, communityId)).orderBy(asc(events.startsAt)).limit(20);
  return Promise.all(list.map(async (e) => {
    const rsvps = await db.select().from(eventRsvps).where(eq(eventRsvps.eventId, e.id));
    return { event: e, count: rsvps.length, going: viewerId ? rsvps.some((r) => r.userId === viewerId) : false };
  }));
}

export async function sendDM(receiverId: string, body: string) {
  const me = await requireUser();
  if (receiverId === me.id) throw new Error("Talk to yourself via scraps instead");
  if (await isBlocked(receiverId, me.id)) throw new Error("You can't message this user (blocked).");
  const clean = body.trim().slice(0, 1000);
  if (!clean) throw new Error("Message is empty");
  assertNoSpam(clean, "Message");
  await db.insert(directMessages).values({ senderId: me.id, receiverId, body: clean });
  revalidatePath(`/messages/${receiverId}`);
}

export async function getConversations() {
  const me = await requireUser();
  const rows = await db.select().from(directMessages).where(
    or(eq(directMessages.senderId, me.id), eq(directMessages.receiverId, me.id))
  ).orderBy(desc(directMessages.createdAt)).limit(100);
  const partners = new Map<string, (typeof rows)[number]>();
  for (const m of rows) {
    const other = m.senderId === me.id ? m.receiverId : m.senderId;
    if (!partners.has(other)) partners.set(other, m);
  }
  return [...partners.entries()];
}

export async function getThread(otherId: string) {
  const me = await requireUser();
  const rows = await db.select().from(directMessages).where(
    or(
      and(eq(directMessages.senderId, me.id), eq(directMessages.receiverId, otherId)),
      and(eq(directMessages.senderId, otherId), eq(directMessages.receiverId, me.id))
    )
  ).orderBy(asc(directMessages.createdAt)).limit(100);
  // mark theirs as read
  for (const m of rows) {
    if (m.receiverId === me.id && !m.readAt) {
      await db.update(directMessages).set({ readAt: new Date() }).where(eq(directMessages.id, m.id));
    }
  }
  return rows;
}
