"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { communities, communityMembers, posts, profileVisits, topics, users } from "@/drizzle/schema";
import { assertNoSpam } from "@/lib/filter";

export async function logVisit(visitedId: string) {
  const me = await requireUser();
  if (visitedId === me.id) return;
  await db.insert(profileVisits).values({ visitorId: me.id, visitedId });
  await db.update(users).set({ profileViews: sql`${users.profileViews} + 1` }).where(eq(users.id, visitedId));
}

export async function createCommunity(form: { name: string; description?: string; category?: string; language?: string }) {
  const me = await requireUser();
  const name = form.name.trim().slice(0, 120);
  if (name.length < 3) throw new Error("Name too short");
  // Names and descriptions go through the same gate, so "Casino Brasil" is fine
  // while an outright spam keyword is refused.
  assertNoSpam(`${name} ${form.description ?? ""}`, "Community");
  const inserted = await db.insert(communities).values({ name, description: form.description, category: form.category, language: form.language, ownerId: me.id, membersCount: 1 }).returning({ id: communities.id }).catch(() => null);
  if (!inserted) throw new Error("Community name taken");
  await db.insert(communityMembers).values({ communityId: inserted[0].id, userId: me.id, role: "owner" });
  revalidatePath("/communities");
  return inserted[0].id;
}

// Resolves the caller's role in a community. `null` means not a member, which is
// what every moderator-only action checks first. Centralised so a new privileged
// action cannot forget the check.
export async function requireRole(communityId: string) {
  const me = await requireUser();
  const rows = await db.select({ role: communityMembers.role })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, me.id)))
    .limit(1);
  const role = rows[0]?.role ?? null;
  return { me, role, isModerator: role === "owner" || role === "moderator" };
}

export async function toggleCommunityMembership(communityId: string) {
  const me = await requireUser();
  const community = (await db.select().from(communities).where(eq(communities.id, communityId)).limit(1))[0];
  if (!community) throw new Error("Community not found");

  const rows = await db.select().from(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, me.id))).limit(1);

  if (rows.length) {
    // Owners cannot walk away and orphan the community.
    if (rows[0].role === "owner") throw new Error("Transfer ownership before leaving");
    await db.delete(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, me.id)));
    await db.update(communities).set({ membersCount: sql`GREATEST(${communities.membersCount} - 1, 0)` }).where(eq(communities.id, communityId));
    revalidatePath(`/communities/${communityId}`);
    return;
  }

  if (community.joinPolicy === "closed") throw new Error("This community is closed to new members");
  if (community.joinPolicy === "approval") {
    throw new Error("This community requires approval. Ask a moderator to add you.");
  }
  await db.insert(communityMembers).values({ communityId, userId: me.id, role: "member" });
  await db.update(communities).set({ membersCount: sql`${communities.membersCount} + 1` }).where(eq(communities.id, communityId));
  revalidatePath(`/communities/${communityId}`);
}

export async function createTopic(communityId: string, title: string, body: string) {
  const me = await requireUser();
  const t = title.trim().slice(0, 200);
  if (t.length < 3 || body.trim().length < 1) throw new Error("Topic needs title + message");
  assertNoSpam(t + " " + body, "Topic");
  const inserted = await db.insert(topics).values({ communityId, authorId: me.id, title: t }).returning({ id: topics.id });
  await db.insert(posts).values({ topicId: inserted[0].id, authorId: me.id, body: body.trim() });
  revalidatePath(`/communities/${communityId}`);
}

export async function replyToTopic(communityId: string, topicId: string, body: string) {
  const me = await requireUser();
  if (!body.trim()) throw new Error("Empty reply");
  assertNoSpam(body, "Reply");
  await db.insert(posts).values({ topicId, authorId: me.id, body: body.trim() });
  revalidatePath(`/communities/${communityId}/forum/${topicId}`);
}

// ---------------------------------------------------------------- moderation

export async function setMemberRole(communityId: string, targetId: string, role: "member" | "moderator") {
  const { role: callerRole, me } = await requireRole(communityId);
  // Only the owner may change roles. If a moderator could promote or demote, the
  // first two moderators could lock the owner out of their own community.
  if (callerRole !== "owner") throw new Error("Only the community owner can change roles");
  if (targetId === me.id) throw new Error("You cannot change your own role");
  const rows = await db.select().from(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, targetId))).limit(1);
  if (!rows.length) throw new Error("Not a member");
  if (rows[0].role === "owner") throw new Error("The owner's role cannot be changed");
  await db.update(communityMembers).set({ role })
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, targetId)));
  revalidatePath(`/communities/${communityId}/members`);
}

export async function removeMember(communityId: string, targetId: string) {
  const { isModerator } = await requireRole(communityId);
  if (!isModerator) throw new Error("Moderators only");
  const rows = await db.select().from(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, targetId))).limit(1);
  if (!rows.length) throw new Error("Not a member");
  if (rows[0].role === "owner") throw new Error("The owner cannot be removed");
  await db.delete(communityMembers).where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, targetId)));
  await db.update(communities).set({ membersCount: sql`GREATEST(${communities.membersCount} - 1, 0)` }).where(eq(communities.id, communityId));
  revalidatePath(`/communities/${communityId}/members`);
  revalidatePath(`/communities/${communityId}`);
}

export async function deleteTopic(communityId: string, topicId: string) {
  const { isModerator, me } = await requireRole(communityId);
  const rows = await db.select().from(topics).where(and(eq(topics.id, topicId), eq(topics.communityId, communityId))).limit(1);
  if (!rows.length) throw new Error("Topic not found");
  // The author can always delete their own topic; a moderator can delete any.
  if (!isModerator && rows[0].authorId !== me.id) {
    throw new Error("You can only delete your own topics");
  }
  await db.delete(topics).where(eq(topics.id, topicId));
  revalidatePath(`/communities/${communityId}`);
}

export async function deletePost(topicId: string, postId: string) {
  const rows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  const post = rows[0];
  if (!post) throw new Error("Post not found");
  const topic = (await db.select().from(topics).where(eq(topics.id, topicId)).limit(1))[0];
  if (!topic) throw new Error("Topic not found");
  const { isModerator, me } = await requireRole(topic.communityId);
  if (!isModerator && post.authorId !== me.id) throw new Error("You can only delete your own replies");
  await db.delete(posts).where(eq(posts.id, postId));
  revalidatePath(`/communities/${topic.communityId}/forum/${topicId}`);
}

export async function updateCommunitySettings(communityId: string, form: { rules?: string; joinPolicy?: "open" | "approval" | "closed" }) {
  const { isModerator } = await requireRole(communityId);
  if (!isModerator) throw new Error("Moderators only");
  const patch: Record<string, unknown> = {};
  if (form.rules !== undefined) {
    assertNoSpam(form.rules, "Rules");
    patch.rules = form.rules.trim().slice(0, 2000) || null;
  }
  if (form.joinPolicy) patch.joinPolicy = form.joinPolicy;
  if (!Object.keys(patch).length) return;
  await db.update(communities).set(patch).where(eq(communities.id, communityId));
  revalidatePath(`/communities/${communityId}`);
}