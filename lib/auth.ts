import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "@/drizzle/schema";
import { passwordProblems } from "@/lib/password";
import { hashPassword, verifyPassword, dummyVerify, needsRehash } from "@/lib/password-hasher";
import { clientIp } from "@/lib/rate-limit";

// Password hashing lives in lib/password-hasher so it can be tested without
// Next.js. These re-exports keep every existing import site working.
export { hashPassword, verifyPassword, needsRehash };

export const SESSION_COOKIE = "orkut_session";
const SESSION_DAYS = 30;

// Touching last_seen_at on every request would mean a database write per page
// view. Five minutes is fine-grained enough for a "last active" label and cheap
// enough to skip when the value is already fresh.
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

// Expired rows are only deleted when something happens to notice them. Logging in
// is a natural moment: it is infrequent, it is already writing to this table, and
// it needs no scheduler. Roughly every 50th login clears the backlog, so an idle
// site stops accumulating rows at once but the table never grows unbounded.
let sincePrune = 0;
const PRUNE_EVERY = 50;

async function maybePrune(): Promise<void> {
  if (++sincePrune < PRUNE_EVERY) return;
  sincePrune = 0;
  try {
    await pruneExpiredSessions();
  } catch {
    // Housekeeping must never be the reason a login fails.
  }
}

/** Best-effort request metadata, captured when a session row is written. */
async function device(): Promise<{ userAgent: string | null; ip: string | null }> {
  try {
    const h = await headers();
    return {
      userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
      ip: clientIp(h),
    };
  } catch {
    return { userAgent: null, ip: null };
  }
}

export { dummyVerify as equalizeTiming };

export async function rehashPassword(userId: string, password: string): Promise<void> {
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
}

export async function createSession(userId: string): Promise<string> {
  void maybePrune();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  const dev = await device();
  await db.insert(sessions).values({ userId, token, expiresAt, ...dev });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Only over HTTPS in production; setting it unconditionally would stop the
    // cookie working on the plain-http local dev server.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(): Promise<void> {
  const user = await getSessionUser();
  if (user) await db.delete(sessions).where(eq(sessions.userId, user.id));
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function changePassword(current: string, next: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) throw new Error("Login required");
  const problems = passwordProblems(next, { name: user.name, email: user.email });
  if (problems.length) throw new Error(problems[0]);
  const full = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!full || !(await verifyPassword(current, full.passwordHash))) {
    throw new Error("Current password is wrong");
  }
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  // log out everywhere else
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, user.id), sql`${sessions.token} <> ${token}`));
}

export async function deleteAccount(password: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) throw new Error("Login required");
  const full = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!full || !(await verifyPassword(password, full.passwordHash))) {
    throw new Error("Password is wrong, account NOT deleted");
  }
  await db.delete(users).where(eq(users.id, user.id));
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  const session = rows[0];
  if (!session || session.expiresAt < new Date()) return null;

  // Fire-and-forget: a failed heartbeat must never block the page.
  if (Date.now() - new Date(session.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
    void db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, session.id))
      .catch(() => {});
  }

  const urows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return urows[0] ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Deletes sessions that already expired. Called opportunistically, not on a schedule. */
export async function pruneExpiredSessions(): Promise<number> {
  const gone = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return gone.length;
}