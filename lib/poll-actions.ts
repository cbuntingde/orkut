"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { communityMembers, pollOptions, pollVotes, polls } from "@/drizzle/schema";

async function mustBeMember(communityId: string, userId: string) {
  const rows = await db.select().from(communityMembers)
    .where(and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, userId))).limit(1);
  if (!rows.length) throw new Error("Join the community to vote");
}

export async function createPoll(communityId: string, question: string, options: string[]) {
  const me = await requireUser();
  await mustBeMember(communityId, me.id);
  const q = question.trim().slice(0, 280);
  const labels = options.map((o) => o.trim().slice(0, 140)).filter(Boolean).slice(0, 6);
  if (q.length < 5) throw new Error("Question too short");
  if (labels.length < 2) throw new Error("Need at least 2 options");
  const inserted = await db.insert(polls).values({ communityId, authorId: me.id, question: q }).returning({ id: polls.id });
  for (const label of labels) {
    await db.insert(pollOptions).values({ pollId: inserted[0].id, label });
  }
  revalidatePath(`/communities/${communityId}`);
}

export async function voteOnPoll(communityId: string, pollId: string, optionId: string) {
  const me = await requireUser();
  await mustBeMember(communityId, me.id);
  const opt = (await db.select().from(pollOptions).where(eq(pollOptions.id, optionId)).limit(1))[0];
  if (!opt || opt.pollId !== pollId) throw new Error("Invalid option");
  const existing = await db.select().from(pollVotes)
    .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.voterId, me.id))).limit(1);
  if (existing.length) throw new Error("You already voted — one vote per poll, like 2004");
  await db.insert(pollVotes).values({ pollId, voterId: me.id, optionId });
  await db.update(pollOptions).set({ votesCount: sql`${pollOptions.votesCount} + 1` }).where(eq(pollOptions.id, optionId));
  revalidatePath(`/communities/${communityId}`);
}

export async function getPolls(communityId: string, viewerId?: string) {
  const list = await db.select().from(polls).where(eq(polls.communityId, communityId)).orderBy(desc(polls.createdAt)).limit(20);
  return Promise.all(list.map(async (p) => {
    const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, p.id));
    const total = options.reduce((a, o) => a + o.votesCount, 0);
    const myVote = viewerId
      ? (await db.select().from(pollVotes).where(and(eq(pollVotes.pollId, p.id), eq(pollVotes.voterId, viewerId))).limit(1))[0]
      : undefined;
    return { poll: p, options, total, myVote };
  }));
}
