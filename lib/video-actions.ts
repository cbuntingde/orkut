"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { videos } from "@/drizzle/schema";
import { assertNoSpam } from "@/lib/filter";
import { videoEmbedUrl } from "@/lib/video-url";

export async function addVideo(form: {
  url: string;
  title?: string;
  communityId?: string;
}) {
  const me = await requireUser();
  const embed = videoEmbedUrl(form.url);
  if (!embed) throw new Error("Paste a YouTube, Vimeo or direct video link");
  const title = form.title?.trim().slice(0, 160);
  assertNoSpam(`${title ?? ""} ${form.url}`, "Video");
  await db.insert(videos).values({
    ownerId: form.communityId ? null : me.id,
    communityId: form.communityId ?? null,
    url: embed,
    title: title || null,
  });
  revalidatePath(form.communityId ? `/communities/${form.communityId}` : `/profile/${me.id}/videos`);
}

export async function deleteVideo(videoId: string) {
  const me = await requireUser();
  await db.delete(videos).where(and(eq(videos.id, videoId), eq(videos.ownerId, me.id)));
  revalidatePath(`/profile/${me.id}/videos`);
}

export async function getVideos(ownerId: string) {
  // A profile video has community_id NULL. eq() rejects null, so spell it out.
  return db.select().from(videos)
    .where(and(eq(videos.ownerId, ownerId), isNull(videos.communityId)))
    .orderBy(desc(videos.createdAt));
}

export async function getCommunityVideos(communityId: string) {
  return db.select().from(videos)
    .where(eq(videos.communityId, communityId))
    .orderBy(desc(videos.createdAt));
}