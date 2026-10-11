"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleFan } from "@/lib/actions";

/**
 * Orkut restricted fans to people in your friend list. Rather than letting the
 * server action throw into a bare form, the rule is shown up front: a
 * non-friend gets a disabled button that says why.
 */
export default function FanButton({ starId, isFan, isFriend }: { starId: string; isFan: boolean; isFriend: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!isFriend) {
    return (
      <>
        <button disabled title="You can only fan people who are your friends" className="w-full cursor-not-allowed rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-400">
          fan (friends only)
        </button>
        <p className="text-[10px] text-gray-400">add them as a friend first</p>
      </>
    );
  }

  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setErr("");
          setBusy(true);
          try {
            await toggleFan(starId);
            router.refresh();
          } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold disabled:opacity-50"
      >
        {isFan ? "★ remove fan" : "fan"}
      </button>
      {err && <p className="text-[10px] text-red-600">{err}</p>}
    </>
  );
}