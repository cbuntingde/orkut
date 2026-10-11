"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCommunity } from "@/lib/community-actions";

export default function NewCommunityForm() {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <form
      className="space-y-2 p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        const fd = new FormData(e.currentTarget);
        try {
          const id = await createCommunity({
            name: String(fd.get("name") ?? ""),
            description: String(fd.get("description") ?? ""),
            category: String(fd.get("category") ?? ""),
            language: String(fd.get("language") ?? ""),
          });
          router.push(`/communities/${id}`);
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <input name="name" required placeholder="community name" className="w-full rounded border border-gray-300 px-2 py-1" />
      <input name="category" placeholder="category (music, sports...)" className="w-full rounded border border-gray-300 px-2 py-1" />
      <input name="language" placeholder="language" className="w-full rounded border border-gray-300 px-2 py-1" />
      <textarea name="description" rows={2} placeholder="what is it about?" className="w-full rounded border border-gray-300 px-2 py-1" />
      <button className="rounded px-3 py-1 font-bold text-white" style={{ background: "#ed2590" }}>create community</button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </form>
  );
}
