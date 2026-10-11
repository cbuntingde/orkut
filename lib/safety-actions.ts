"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { blocks, reports, users } from "@/drizzle/schema";
import { reevaluateJail } from "@/lib/notify";

export async function toggleBlock(blockedId: string): Promise<{ blocked: boolean }> {
  const me = await requireUser();
  if (blockedId === me.id) throw new Error("You can't block yourself");
  const existing = await db.select().from(blocks)
    .where(and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, blockedId))).limit(1);
  if (existing.length) {
    await db.delete(blocks).where(and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, blockedId)));
    revalidatePath(`/profile/${blockedId}`);
    return { blocked: false };
  }
  await db.insert(blocks).values({ blockerId: me.id, blockedId });
  revalidatePath(`/profile/${blockedId}`);
  return { blocked: true };
}

export async function isBlocked(a: string, b: string): Promise<boolean> {
  const rows = await db.select().from(blocks)
    .where(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b))).limit(1);
  return rows.length > 0;
}

export async function fileReport(targetType: string, targetId: string, reason: string) {
  const me = await requireUser();
  const clean = reason.trim().slice(0, 280);
  if (clean.length < 5) throw new Error("Tell us what happened (5+ chars)");
  const allowed = ["profile", "scrap", "testimonial", "community", "topic", "post", "photo"];
  if (!allowed.includes(targetType)) throw new Error("Invalid report target");
  await db.insert(reports).values({ reporterId: me.id, targetType, targetId, reason: clean, status: "open" });
  revalidatePath("/moderation");
}

export async function getBlockedUsers() {
  const me = await requireUser();
  const rows = await db.select().from(blocks).where(eq(blocks.blockerId, me.id));
  return Promise.all(rows.map(async (b) => ({
    block: b,
    user: (await db.select().from(users).where(eq(users.id, b.blockedId)).limit(1))[0],
  })));
}

export async function getOpenReports() {
  await requireUser();
  return db.select().from(reports).where(eq(reports.status, "open")).orderBy(desc(reports.createdAt)).limit(50);
}

export async function moderateReport(id: string, decision: "actioned" | "dismissed") {
  await requireUser();
  const before = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  await db.update(reports).set({ status: decision }).where(eq(reports.id, id));
  // Orkut's jail: reports accumulate into a temporary restriction rather than an
  // instant ban, so one malicious report cannot lock someone out on its own.
  // Only profile reports carry a user id worth re-evaluating.
  const r = before[0];
  if (r?.targetType === "profile" && r.targetId) {
    if (decision === "actioned") await reevaluateJail(r.targetId);
    else await db.update(users).set({ jailedUntil: null }).where(eq(users.id, r.targetId));
  }
  revalidatePath("/moderation");
}

// Manual override for the jail, for when the automatic ladder gets it wrong.
export async function setJail(userId: string, days: number) {
  await requireUser();
  if (days > 0) {
    await db.update(users)
      .set({ jailedUntil: new Date(Date.now() + days * 86_400_000) })
      .where(eq(users.id, userId));
  } else {
    await db.update(users).set({ jailedUntil: null }).where(eq(users.id, userId));
  }
  revalidatePath("/moderation");
}
