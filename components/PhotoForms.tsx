"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { commentOnPhoto } from "@/lib/photo-actions";

export function PhotoCard({ photoId, caption, isMine }: { photoId: string; caption: string | null; isMine: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="border-t p-3">
      {caption && <p className="mb-1 text-sm italic">{caption}</p>}
      <form
        className="mt-1 flex gap-1"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setErr("");
          try {
            await commentOnPhoto(photoId, body);
            setBody("");
            router.refresh();
          } catch (err2: unknown) {
            setErr(err2 instanceof Error ? err2.message : "Failed");
          }
        }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          placeholder="comment..."
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <button className="rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">post</button>
      </form>
      {err && <p className="mt-1 text-[10px] text-red-600">{err}</p>}
    </div>
  );
}