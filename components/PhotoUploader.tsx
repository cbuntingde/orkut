"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPhoto, createAlbum } from "@/lib/photo-actions";

export default function PhotoUploader({ ownerId, albums }: { ownerId: string; albums: { id: string; title: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumId, setAlbumId] = useState("");

  async function run(fn: () => Promise<void>) {
    setErr("");
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-b p-3 text-sm">
      <form
        action={async (fd: FormData) => {
          await run(async () => {
            await addPhoto(fd);
            if (fileRef.current) fileRef.current.value = "";
          });
        }}
        className="space-y-2"
      >
        <input type="hidden" name="ownerId" value={ownerId} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="text-xs"
          />
          <input name="url" placeholder="…or paste an image URL" className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {albums.length > 0 && (
            <select name="albumId" value={albumId} onChange={(e) => setAlbumId(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="">no album</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          )}
          <input name="caption" placeholder="caption" className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
          <button disabled={busy} className="rounded px-2 py-1 text-xs font-bold text-white" style={{ background: "var(--orkut-pink)" }}>
            add photo
          </button>
        </div>
        <p className="text-[10px] text-gray-400">JPEG, PNG, GIF or WebP, up to 5 MB.</p>
      </form>

      <form
        action={async (fd: FormData) => {
          const title = String(fd.get("albumTitle") ?? "");
          if (title.trim().length < 3) {
            setErr("Album title too short");
            return;
          }
          await run(async () => {
            await createAlbum(ownerId, title);
            setAlbumTitle("");
          });
        }}
        className="flex items-center gap-2 border-t pt-2"
      >
        <input
          name="albumTitle"
          value={albumTitle}
          onChange={(e) => setAlbumTitle(e.target.value)}
          placeholder="new album title"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <button disabled={busy} className="rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">create album</button>
      </form>

      {err && <p className="text-xs font-bold text-red-600">{err}</p>}
    </div>
  );
}