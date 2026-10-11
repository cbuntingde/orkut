"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPoll, voteOnPoll } from "@/lib/poll-actions";

export function NewPollForm({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <form
      className="space-y-1 p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        const fd = new FormData(e.currentTarget);
        const options = [fd.get("o1"), fd.get("o2"), fd.get("o3"), fd.get("o4")].map((v) => String(v ?? ""));
        try {
          await createPoll(communityId, String(fd.get("question") ?? ""), options);
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <input name="question" required maxLength={280} placeholder="ask a question..." className="w-full rounded border border-gray-300 px-2 py-1" />
      <div className="grid grid-cols-2 gap-1">
        <input name="o1" required placeholder="option 1" className="rounded border border-gray-300 px-2 py-1" />
        <input name="o2" required placeholder="option 2" className="rounded border border-gray-300 px-2 py-1" />
        <input name="o3" placeholder="option 3" className="rounded border border-gray-300 px-2 py-1" />
        <input name="o4" placeholder="option 4" className="rounded border border-gray-300 px-2 py-1" />
      </div>
      <button className="rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">create poll</button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </form>
  );
}

export function PollCard({ communityId, pollId, question, options, total, myVoteId }: {
  communityId: string; pollId: string; question: string;
  options: { id: string; label: string; votesCount: number }[];
  total: number; myVoteId?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <div className="p-3">
      <p className="text-sm font-bold">{question}</p>
      <p className="text-xs text-gray-500">{total} votes{myVoteId ? " · you voted" : ""}</p>
      <div className="mt-2 space-y-1">
        {options.map((o) => {
          const pct = total ? Math.round((o.votesCount / total) * 100) : 0;
          return (
            <button
              key={o.id}
              disabled={!!myVoteId}
              onClick={async () => {
                setErr("");
                try {
                  await voteOnPoll(communityId, pollId, o.id);
                  router.refresh();
                } catch (e: unknown) {
                  setErr(e instanceof Error ? e.message : "Failed");
                }
              }}
              className="block w-full rounded border border-gray-200 p-1.5 text-left text-xs hover:bg-gray-50 disabled:cursor-default"
            >
              <span className="flex justify-between font-bold">
                <span>{o.label}{myVoteId === o.id ? " ✓" : ""}</span>
                <span>{o.votesCount} ({pct}%)</span>
              </span>
              <span className="mt-0.5 block h-1.5 rounded bg-gray-100">
                <span className="block h-1.5 rounded" style={{ width: `${pct}%`, background: "#ed2590" }} />
              </span>
            </button>
          );
        })}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
