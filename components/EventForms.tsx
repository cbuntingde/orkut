"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent, toggleRsvp } from "@/lib/social-actions";

export function NewEventForm({ communityId }: { communityId: string }) {
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
          await createEvent(communityId, {
            title: String(fd.get("title") ?? ""),
            description: String(fd.get("description") ?? ""),
            location: String(fd.get("location") ?? ""),
            startsAt: String(fd.get("startsAt") ?? ""),
          });
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (e: unknown) {
          setErr(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <input name="title" required placeholder="event title" className="w-full rounded border border-gray-300 px-2 py-1" />
      <input name="location" placeholder="location" className="w-full rounded border border-gray-300 px-2 py-1" />
      <input name="startsAt" required type="datetime-local" className="w-full rounded border border-gray-300 px-2 py-1" />
      <textarea name="description" rows={2} placeholder="details..." className="w-full rounded border border-gray-300 px-2 py-1" />
      <button className="rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">create event</button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </form>
  );
}

export function EventCard({ communityId, eventId, title, location, startsAt, description, count, going }: {
  communityId: string; eventId: string; title: string; location: string | null;
  startsAt: Date; description: string | null; count: number; going: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex items-start justify-between gap-2 p-3">
      <div className="text-sm">
        <p className="font-bold">{title}</p>
        <p className="text-xs text-gray-500">{new Date(startsAt).toLocaleString()}{location ? ` · ${location}` : ""} · {count} going</p>
        {description && <p className="mt-1 text-xs">{description}</p>}
      </div>
      <button
        onClick={async () => { await toggleRsvp(communityId, eventId); router.refresh(); }}
        className="rounded px-2 py-1 text-xs font-bold"
        style={{ background: going ? "#dfd" : "#e5ecf9" }}
      >
        {going ? "✓ going" : "RSVP"}
      </button>
    </div>
  );
}
