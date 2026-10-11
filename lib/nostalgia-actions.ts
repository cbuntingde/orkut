"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { crushes, users } from "@/drizzle/schema";
import { isBlocked } from "@/lib/safety-actions";

// Photo and video handling moved to lib/photo-actions.ts and lib/video-actions.ts
// when real uploads and albums arrived. This file is now just the crush list.

export async function toggleCrush(crusheeId: string): Promise<{ crushed: boolean; mutual: boolean }> {
  const me = await requireUser();
  if (crusheeId === me.id) throw new Error("You can't crush on yourself");
  const target = (await db.select({ id: users.id }).from(users).where(eq(users.id, crusheeId)).limit(1))[0];
  if (!target) throw new Error("User not found");
  if (await isBlocked(crusheeId, me.id)) throw new Error("You can't crush this user (blocked).");
  const existing = await db.select().from(crushes)
    .where(and(eq(crushes.admirerId, me.id), eq(crushes.crusheeId, crusheeId))).limit(1);
  if (existing.length) {
    await db.delete(crushes).where(and(eq(crushes.admirerId, me.id), eq(crushes.crusheeId, crusheeId)));
    revalidatePath(`/profile/${crusheeId}`);
    return { crushed: false, mutual: false };
  }
  await db.insert(crushes).values({ admirerId: me.id, crusheeId });
  const reverse = await db.select().from(crushes)
    .where(and(eq(crushes.admirerId, crusheeId), eq(crushes.crusheeId, me.id))).limit(1);
  revalidatePath(`/profile/${crusheeId}`);
  revalidatePath("/crushes");
  return { crushed: true, mutual: reverse.length > 0 };
}

export async function getCrushState(crusheeId: string) {
  const me = await requireUser();
  const mine = await db.select().from(crushes)
    .where(and(eq(crushes.admirerId, me.id), eq(crushes.crusheeId, crusheeId))).limit(1);
  if (!mine.length) return { crushed: false, mutual: false };
  const reverse = await db.select().from(crushes)
    .where(and(eq(crushes.admirerId, crusheeId), eq(crushes.crusheeId, me.id))).limit(1);
  return { crushed: true, mutual: reverse.length > 0 };
}