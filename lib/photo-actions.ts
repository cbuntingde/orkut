"use server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { photoAlbums, photoComments, photos } from "@/drizzle/schema";
import { assertNoSpam } from "@/lib/filter";
import { uploadDir } from "@/lib/storage";

const MAX_BYTES = 5 * 1024 * 1024; // Orkut's historical photo cap
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

export async function createAlbum(ownerId: string, title: string, description?: string) {
  const me = await requireUser();
  if (me.id !== ownerId) throw new Error("Not allowed");
  const clean = title.trim().slice(0, 120);
  if (clean.length < 3) throw new Error("Album title too short");
  assertNoSpam(clean, "Album");
  const rows = await db
    .insert(photoAlbums)
    .values({ ownerId, title: clean, description: description?.trim().slice(0, 280) || null })
    .returning({ id: photoAlbums.id });
  revalidatePath(`/profile/${ownerId}/photos`);
  return rows[0].id;
}

export async function addPhoto(form: FormData) {
  const me = await requireUser();
  const ownerId = String(form.get("ownerId") ?? me.id);
  if (ownerId !== me.id) throw new Error("Not allowed");
  const albumIdRaw = form.get("albumId");
  const albumId = albumIdRaw ? String(albumIdRaw) : null;
  const caption = String(form.get("caption") ?? "").trim().slice(0, 280);
  assertNoSpam(caption, "Caption");

  if (albumId) {
    const owns = await db.select({ id: photoAlbums.id }).from(photoAlbums)
      .where(and(eq(photoAlbums.id, albumId), eq(photoAlbums.ownerId, me.id))).limit(1);
    if (!owns.length) throw new Error("Album not found");
  }

  const file = form.get("file");
  let url: string;

  if (file instanceof File && file.size > 0) {
    const ext = ALLOWED.get(file.type);
    if (!ext) throw new Error("Only JPEG, PNG, GIF or WebP images are allowed");
    if (file.size > MAX_BYTES) throw new Error("Image must be under 5 MB");
    const name = `${me.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
    url = `/uploads/${name}`;
  } else {
    // Keep the old URL-based path working; it is how the seeded photos arrive.
    const pasted = String(form.get("url") ?? "").trim();
    if (!/^https?:\/\/[^\s]{4,2000}$/.test(pasted)) {
      throw new Error("Choose an image, or paste an image URL");
    }
    url = pasted;
  }

  await db.insert(photos).values({ ownerId: me.id, albumId, url, caption: caption || null });
  revalidatePath(`/profile/${me.id}/photos`);
}

export async function deletePhoto(photoId: string) {
  const me = await requireUser();
  await db.delete(photos).where(and(eq(photos.id, photoId), eq(photos.ownerId, me.id)));
  revalidatePath(`/profile/${me.id}/photos`);
}

export async function movePhotoToAlbum(photoId: string, albumId: string | null) {
  const me = await requireUser();
  const owns = await db.select({ id: photos.id }).from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.ownerId, me.id))).limit(1);
  if (!owns.length) throw new Error("Not your photo");
  await db.update(photos).set({ albumId }).where(eq(photos.id, photoId));
  revalidatePath(`/profile/${me.id}/photos`);
}

export async function deleteAlbum(albumId: string) {
  const me = await requireUser();
  const owns = await db.select({ id: photoAlbums.id }).from(photoAlbums)
    .where(and(eq(photoAlbums.id, albumId), eq(photoAlbums.ownerId, me.id))).limit(1);
  if (!owns.length) throw new Error("Not your album");
  await db.delete(photoAlbums).where(eq(photoAlbums.id, albumId));
  revalidatePath(`/profile/${me.id}/photos`);
}

export async function commentOnPhoto(photoId: string, body: string) {
  const me = await requireUser();
  const clean = body.trim().slice(0, 500);
  if (!clean) throw new Error("Comment is empty");
  assertNoSpam(clean, "Comment");
  await db.insert(photoComments).values({ photoId, authorId: me.id, body: clean });
  const owner = (await db.select({ ownerId: photos.ownerId }).from(photos).where(eq(photos.id, photoId)).limit(1))[0];
  revalidatePath(`/profile/${owner?.ownerId ?? me.id}/photos`);
}

export async function getPhotos(ownerId: string) {
  const list = await db.select().from(photos).where(eq(photos.ownerId, ownerId)).orderBy(desc(photos.createdAt));
  return Promise.all(
    list.map(async (photo) => ({
      photo,
      comments: await db.select().from(photoComments)
        .where(eq(photoComments.photoId, photo.id))
        .orderBy(desc(photoComments.createdAt)).limit(20),
    }))
  );
}

export async function getAlbums(ownerId: string) {
  return db.select().from(photoAlbums)
    .where(eq(photoAlbums.ownerId, ownerId)).orderBy(desc(photoAlbums.createdAt));
}