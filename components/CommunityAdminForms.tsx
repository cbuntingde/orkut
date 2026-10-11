"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCommunitySettings } from "@/lib/community-actions";

export default function CommunityAdminForms({
  communityId,
  rules,
  joinPolicy,
}: {
  communityId: string;
  rules: string;
  joinPolicy: "open" | "approval" | "closed";
}) {
  const router = useRouter();
  const [err, setErr] = useState("");

  async function save(fd: FormData) {
    setErr("");
    try {
      await updateCommunitySettings(communityId, {
        rules: String(fd.get("rules") ?? ""),
        joinPolicy: String(fd.get("joinPolicy") ?? "open") as "open" | "approval" | "closed",
      });
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <form action={save} className="space-y-2 p-3 text-sm">
      <label className="block text-xs font-bold text-gray-600">community rules</label>
      <textarea
        name="rules"
        defaultValue={rules}
        rows={4}
        placeholder="Be decent. No spam. No begging for scraps."
        className="w-full rounded border border-gray-300 p-2 text-sm"
      />
      <label className="block text-xs font-bold text-gray-600">who can join</label>
      <select name="joinPolicy" defaultValue={joinPolicy} className="w-full rounded border border-gray-300 p-2 text-sm">
        <option value="open">anyone, instantly</option>
        <option value="approval">moderator approval required</option>
        <option value="closed">closed, no new members</option>
      </select>
      <button className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: "#ed2590" }}>
        save community settings
      </button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </form>
  );
}