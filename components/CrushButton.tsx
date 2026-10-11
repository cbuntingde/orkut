"use client";
import { useState } from "react";
import { toggleCrush } from "@/lib/nostalgia-actions";

export default function CrushButton({ crusheeId, initial }: { crusheeId: string; initial: { crushed: boolean; mutual: boolean } }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="text-center">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setState(await toggleCrush(crusheeId));
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
        style={{ background: state.crushed ? "#999" : "#ed2590" }}
      >
        {state.crushed ? "💔 remove crush" : "💘 add to crush list"}
      </button>
      {state.crushed && !state.mutual && <p className="mt-1 text-[11px] text-gray-500">secret — they can&apos;t see this unless they crush you back</p>}
      {state.mutual && <p className="mt-1 text-[11px] font-bold text-pink-600">💞 mutual crush! go send a scrap!</p>}
    </div>
  );
}
