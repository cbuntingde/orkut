import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, notifications, reports, users } from "@/drizzle/schema";
import { jailDaysFor } from "@/lib/jail";

export type NotifyKind = "friend_request" | "friend_accept" | "scrap" | "testimonial" | "report";

/**
 * Records a notification for someone. Silently does nothing when the actor is
 * the recipient, which is the common case for self-directed actions.
 */
export async function notify(input: {
  userId: string;
  kind: NotifyKind;
  actorId?: string;
  targetId?: string;
  body?: string;
}) {
  if (!input.userId || input.userId === input.actorId) return;
  await db.insert(notifications).values({
    userId: input.userId,
    kind: input.kind,
    actorId: input.actorId,
    targetId: input.targetId,
    body: input.body,
  });
}

export async function getNotifications(userId: string, limit = 20) {
  return db
    .select({ notification: notifications, actor: users })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
  return rows.length;
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
}

// ------------------------------------------------------------- jail system

export class JailedError extends Error {
  constructor(until: Date) {
    const days = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 86_400_000));
    super(`Your account is restricted for another ${days} day${days === 1 ? "" : "s"} because of reported content.`);
    this.name = "JailedError";
  }
}

/**
 * Orkut's jail: reports accumulated into a temporary restriction instead of an
 * instant ban, because a single malicious report could otherwise be used to lock
 * anyone out. Throws when the caller is currently jailed, otherwise returns the
 * number of open reports filed against them.
 */
export async function assertNotJailed(userId: string): Promise<void> {
  const u = (await db.select({ jailedUntil: users.jailedUntil }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (u?.jailedUntil && u.jailedUntil > new Date()) throw new JailedError(u.jailedUntil);
}

/**
 * Reports that were upheld against this profile. Deliberately counts
 * "actioned", not "open": moderation closes a report the moment it acts on it,
 * so counting open reports would make the ladder unreachable.
 */
export async function upheldReportCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.targetType, "profile"), eq(reports.targetId, userId), eq(reports.status, "actioned")));
  return rows.length;
}

export async function reevaluateJail(userId: string): Promise<{ jailedUntil: Date | null }> {
  const upheld = await upheldReportCount(userId);
  const decision = jailDaysFor(upheld);
  if (!decision) {
    await db.update(users).set({ jailedUntil: null }).where(eq(users.id, userId));
    return { jailedUntil: null };
  }
  const until = new Date(Date.now() + decision.days * 86_400_000);
  await db.update(users).set({ jailedUntil: until, jailCount: sql`${users.jailCount} + 1` }).where(eq(users.id, userId));
  return { jailedUntil: until };
}

/**
 * Orkut allowed anyone to view any profile, gated only by an Ignore List. This
 * keeps that openness while giving a jailed account a courtesy explanation
 * instead of a silent page.
 */
export async function canViewProfile(userId: string): Promise<{ jailed: boolean; until: Date | null }> {
  const u = (await db.select({ jailedUntil: users.jailedUntil }).from(users).where(eq(users.id, userId)).limit(1))[0];
  const jailed = !!u?.jailedUntil && u.jailedUntil > new Date();
  return { jailed, until: jailed ? u!.jailedUntil : null };
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const found = await db.select().from(friendships).where(
    and(
      eq(friendships.status, "accepted"),
      sql`(${friendships.requesterId} = ${a} AND ${friendships.addresseeId} = ${b})
        OR (${friendships.requesterId} = ${b} AND ${friendships.addresseeId} = ${a})`,
    )
  ).limit(1);
  return found.length > 0;
}