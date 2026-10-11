"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendDM } from "@/lib/social-actions";

export default function DMForm({ otherId }: { otherId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  return (
    <form
      className="flex gap-2 border-t p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        try {
          await sendDM(otherId, body);
          setBody("");
          router.refresh();
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="write a message..." className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm" />
      <button className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: "#ed2590" }}>send</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </form>
  );
}
