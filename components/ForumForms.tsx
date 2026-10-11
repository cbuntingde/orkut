"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTopic, replyToTopic } from "@/lib/community-actions";

export function NewTopicForm({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <form
      className="space-y-1 p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        const fd = new FormData(e.currentTarget);
        try {
          await createTopic(communityId, String(fd.get("title") ?? ""), String(fd.get("body") ?? ""));
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <input name="title" required placeholder="topic title" className="w-full rounded border border-gray-300 px-2 py-1" />
      <textarea name="body" required rows={2} placeholder="first message..." className="w-full rounded border border-gray-300 px-2 py-1" />
      <button className="rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">start topic</button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </form>
  );
}

export function ReplyForm({ communityId, topicId }: { communityId: string; topicId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  return (
    <form
      className="flex gap-2 p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        await replyToTopic(communityId, topicId, body);
        setBody("");
        router.refresh();
      }}
    >
      <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="reply..." className="flex-1 rounded border border-gray-300 px-2 py-1" />
      <button className="rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">reply</button>
    </form>
  );
}
