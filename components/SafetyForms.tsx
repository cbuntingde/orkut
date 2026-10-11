"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleBlock, fileReport } from "@/lib/safety-actions";

export function BlockButton({ blockedId, initial }: { blockedId: string; initial: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initial);
  return (
    <button
      onClick={async () => {
        const r = await toggleBlock(blockedId);
        setBlocked(r.blocked);
        router.refresh();
      }}
      className="w-full rounded px-2 py-1 text-xs font-bold"
      style={{ background: blocked ? "#fee" : "#eee", color: blocked ? "#a00" : "#333" }}
    >
      {blocked ? "unblock user" : "block user"}
    </button>
  );
}

export function ReportForm({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-[11px] text-gray-500 underline">report</button>;
  }
  return (
    <form
      className="mt-1 flex flex-col gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("");
        try {
          await fileReport(targetType, targetId, reason);
          setMsg("Reported — thanks for keeping orkut safe.");
          setReason("");
          setOpen(false);
        } catch (e: unknown) {
          setMsg(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="what happened?" className="rounded border border-gray-300 px-1 py-0.5 text-[11px]" />
      <div className="flex gap-1">
        <button className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">send report</button>
        <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-gray-500">cancel</button>
      </div>
      {msg && <p className="text-[11px] text-gray-600">{msg}</p>}
    </form>
  );
}
