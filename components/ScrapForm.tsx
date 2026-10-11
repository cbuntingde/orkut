"use client";
import { useState } from "react";
import { postScrap } from "@/lib/actions";
import ScrapText from "./ScrapText";

export default function ScrapForm({ ownerId }: { ownerId: string }) {
  const [body, setBody] = useState("");
  const [priv, setPriv] = useState(false);
  const [err, setErr] = useState("");

  return (
    <form
      className="border-b p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        try {
          await postScrap(ownerId, body, priv);
          setBody("");
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="leave a scrap... [b]bold[/b] [red]colour[/red] [link=url]link[/link] :)"
        className="w-full rounded border border-gray-300 p-2 text-sm"
      />

      {body.trim().length > 0 && (
        <div className="mt-2 rounded bg-gray-50 p-2 text-sm">
          <p className="mb-1 text-[10px] font-bold uppercase text-gray-400">preview</p>
          <ScrapText body={body} />
        </div>
      )}

      <div className="mt-1 flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> private
        </label>
        <button className="rounded px-2 py-1 font-bold text-white" style={{ background: "#ed2590" }}>send scrap</button>
        <span className="ml-auto text-gray-400">{body.length}/1000</span>
        {err && <span className="text-red-600">{err}</span>}
      </div>
    </form>
  );
}