"use server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notifications } from "@/drizzle/schema";

export async function markAllRead(): Promise<void> {
  const me = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, me.id), sql`${notifications.readAt} IS NULL`));
}