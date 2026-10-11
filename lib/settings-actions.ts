"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { changePassword, deleteAccount, destroyAllSessions, destroySession } from "@/lib/auth";
import { revokeOtherSessions, revokeSession } from "@/lib/session";
import { users } from "@/drizzle/schema";
import { THEME_KEYS } from "@/lib/orkut";

export async function setTheme(theme: string) {
  if (!THEME_KEYS.includes(theme as never)) throw new Error("Unknown theme");
  const me = await requireUser();
  await db.update(users).set({ theme }).where(eq(users.id, me.id));
}

export async function changePasswordAction(current: string, next: string) {
  await changePassword(current, next);
}

export async function deleteAccountAction(password: string) {
  await deleteAccount(password);
  redirect("/");
}

export async function logoutHereAction() {
  await destroySession();
  redirect("/login");
}

export async function logoutEverywhereAction() {
  await destroyAllSessions();
  redirect("/login");
}

/**
 * Signs out one other device. The session id comes from a hidden field, so it is
 * filtered by the signed-in user on the way into the database: an id belonging to
 * somebody else matches no row.
 */
export async function revokeSessionAction(sessionId: string) {
  const me = await requireUser();
  await revokeSession(me.id, sessionId);
  revalidatePath("/settings");
}

/** Signs out every device except this one, so the user stays logged in here. */
export async function revokeOtherSessionsAction() {
  const me = await requireUser();
  await revokeOtherSessions(me.id);
  revalidatePath("/settings");
}
