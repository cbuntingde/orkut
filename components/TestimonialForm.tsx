"use client";
import { useState } from "react";
import { writeTestimonial } from "@/lib/actions";

export default function TestimonialForm({ subjectId }: { subjectId: string }) {
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="border-t p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("");
        try {
          await writeTestimonial(subjectId, body);
          setBody("");
          setMsg("Sent for approval!");
        } catch (e: unknown) {
          setMsg(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="write a testimonial..." className="w-full rounded border border-gray-300 p-2 text-xs" />
      <button className="mt-1 rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">send testimonial</button>
      {msg && <p className="mt-1 text-xs text-gray-600">{msg}</p>}
    </form>
  );
}
