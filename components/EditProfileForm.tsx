"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/lib/actions";

const FIELDS = ["status", "relationship", "city", "country", "about", "interests", "music", "movies", "books", "avatarUrl"] as const;

export default function EditProfileForm({ initial }: { initial: Record<string, string | null> }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  return (
    <form
      className="space-y-2 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const payload: Record<string, string> = {};
        for (const f of FIELDS) payload[f] = String(fd.get(f) ?? "");
        await updateProfile(payload);
        setMsg("Saved!");
        router.refresh();
      }}
    >
      {FIELDS.map((f) => (
        <label key={f} className="block text-xs">
          <span className="font-bold capitalize">{f}</span>
          <input name={f} defaultValue={initial[f] ?? ""} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>
      ))}
      <label className="block text-xs">
        <span className="font-bold">birthday</span>
        <input name="dob" type="date" defaultValue={initial.dob ? String(initial.dob).slice(0, 10) : ""} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
      </label>
      <button className="rounded px-3 py-2 text-sm font-bold text-white" style={{ background: "#ed2590" }}>save profile</button>
      {msg && <p className="text-xs text-green-700">{msg}</p>}
    </form>
  );
}
