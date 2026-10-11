"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setFriendTier } from "@/lib/actions";

export type Tier = "acquaintance" | "good" | "best";

const OPTIONS: [Tier, string][] = [
  ["acquaintance", "acquaintance"],
  ["good", "good friend"],
  ["best", "best friend"],
];

// Lives in its own client component because the friends page is a server
// component, which cannot carry an onChange handler.
export default function FriendTierSelect({ otherId, tier }: { otherId: string; tier: Tier }) {
  const router = useRouter();
  const [value, setValue] = useState<Tier>(tier);
  const [busy, setBusy] = useState(false);

  return (
    <select
      value={value}
      disabled={busy}
      aria-label={`Closeness with ${otherId}`}
      onChange={async (e) => {
        const next = e.target.value as Tier;
        const prev = value;
        setValue(next);
        setBusy(true);
        try {
          await setFriendTier(otherId, next);
          router.refresh();
        } catch {
          setValue(prev);
        } finally {
          setBusy(false);
        }
      }}
      className="rounded border border-gray-300 px-1 py-0.5 text-[11px] disabled:opacity-50"
    >
      {OPTIONS.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}