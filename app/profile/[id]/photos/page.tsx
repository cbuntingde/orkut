import Link from "next/link";
import { eq } from "drizzle-orm";
import Header from "@/components/Header";
import { PhotoCard } from "@/components/PhotoForms";
import PhotoUploader from "@/components/PhotoUploader";
import { PhotoActions, AlbumDelete } from "@/components/PhotoActions";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getAlbums, getPhotos } from "@/lib/photo-actions";
import { users } from "@/drizzle/schema";

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u) return <div className="p-8">User not found.</div>;

  const [items, albums] = await Promise.all([getPhotos(id), getAlbums(id)]);
  const isMine = me?.id === id;

  const byAlbum = new Map<string, typeof items>();
  const unfiled: typeof items = [];
  for (const item of items) {
    if (item.photo.albumId) {
      if (!byAlbum.has(item.photo.albumId)) byAlbum.set(item.photo.albumId, []);
      byAlbum.get(item.photo.albumId)!.push(item);
    } else {
      unfiled.push(item);
    }
  }

  function grid(rows: typeof items) {
    return (
      <div className="grid gap-2 p-3 md:grid-cols-2">
        {rows.map(({ photo, comments }) => (
          <div key={photo.id} className="orkut-box relative overflow-hidden">
            {isMine && <PhotoActions photoId={photo.id} ownerId={id} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.caption ?? "photo"} className="max-h-64 w-full object-cover" loading="lazy" />
            <PhotoCard photoId={photo.id} caption={photo.caption} isMine={!!isMine} />
            {comments.length > 0 && (
              <div className="space-y-1 border-t bg-gray-50 p-2 text-xs">
                {comments.map((c) => <p key={c.id}>{c.body}</p>)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <Link href={`/profile/${id}`} className="orkut-link text-xs">← back to {u.name.split(" ")[0]}&apos;s profile</Link>

        <div className="orkut-box">
          <div className="orkut-box-header">photos ({items.length})</div>
          {isMine && <PhotoUploader ownerId={id} albums={albums.map((a) => ({ id: a.id, title: a.title }))} />}
          {items.length === 0 && <p className="p-3 text-xs text-gray-500">No photos yet.</p>}
          {items.length > 0 && unfiled.length > 0 && (
            <>
              <div className="border-t px-3 py-1 text-[10px] font-bold uppercase text-gray-400">unfiled ({unfiled.length})</div>
              {grid(unfiled)}
            </>
          )}
        </div>

        {albums.map((album) => {
          const rows = byAlbum.get(album.id) ?? [];
          return (
            <div key={album.id} className="orkut-box">
              <div className="orkut-box-header flex items-center justify-between">
                <span>{album.title} ({rows.length})</span>
                {isMine && <AlbumDelete albumId={album.id} />}
              </div>
              {album.description && <p className="px-3 pt-2 text-xs text-gray-600">{album.description}</p>}
              {rows.length > 0 ? grid(rows) : <p className="p-3 text-xs text-gray-500">No photos in this album.</p>}
            </div>
          );
        })}
      </main>
    </div>
  );
}