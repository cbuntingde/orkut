"use client";
import { useRouter } from "next/navigation";
import { deleteAlbum, deletePhoto } from "@/lib/photo-actions";

/**
 * Rendered only when the viewer owns the photo — the call site owns that
 * decision, so no ownership prop is needed here. The delete action checks the
 * owner server-side regardless, so a stale render is harmless.
 */
export function PhotoActions({ photoId }: { photoId: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await deletePhoto(photoId);
        router.refresh();
      }}
      className="absolute right-1 top-1 rounded bg-white/90 px-1 text-[10px] text-red-600"
    >
      ✕
    </button>
  );
}

export function AlbumDelete({ albumId }: { albumId: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!confirm("Delete this album? Photos stay, they just become unfiled.")) return;
        await deleteAlbum(albumId);
        router.refresh();
      }}
      className="text-[10px] text-red-600 underline"
    >
      delete album
    </button>
  );
}