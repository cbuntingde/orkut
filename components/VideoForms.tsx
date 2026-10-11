"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addVideo, deleteVideo } from "@/lib/video-actions";

export function AddVideoForm({ communityId }: { communityId?: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap gap-2 border-b p-3 text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        const fd = new FormData(e.currentTarget);
        try {
          await addVideo({
            url: String(fd.get("url") ?? ""),
            title: String(fd.get("title") ?? ""),
            communityId,
          });
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (err2: unknown) {
          setErr(err2 instanceof Error ? err2.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input name="url" required placeholder="https://youtube.com/watch?v=..." className="flex-1 rounded border border-gray-300 px-2 py-1" />
      <input name="title" placeholder="title" className="w-40 rounded border border-gray-300 px-2 py-1" />
      <button disabled={busy} className="rounded px-2 py-1 font-bold text-white" style={{ background: "var(--orkut-pink)" }}>
        add video
      </button>
      {err && <span className="w-full text-red-600">{err}</span>}
    </form>
  );
}

export function VideoList({ videos, canDelete }: { videos: { id: string; url: string; title: string | null }[]; canDelete?: boolean }) {
  const router = useRouter();
  if (!videos.length) return <p className="p-3 text-xs text-gray-500">No videos yet.</p>;
  return (
    <div className="grid gap-2 p-3 md:grid-cols-2">
      {videos.map((v) => (
        <div key={v.id} className="orkut-box relative overflow-hidden">
          {canDelete && (
            <button
              onClick={async () => {
                await deleteVideo(v.id);
                router.refresh();
              }}
              className="absolute right-1 top-1 z-10 rounded bg-white/90 px-1 text-[10px] text-red-600"
            >
              ✕
            </button>
          )}
          <iframe
            src={v.url}
            title={v.title ?? "video"}
            className="aspect-video w-full"
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
          {v.title && <p className="p-2 text-xs">{v.title}</p>}
        </div>
      ))}
    </div>
  );
}