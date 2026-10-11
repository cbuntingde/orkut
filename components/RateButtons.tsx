"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rateUser } from "@/lib/actions";

type Field = "cool" | "sexy" | "trustworthy";

const CATS: { key: Field; glyph: string; label: string }[] = [
  { key: "cool", glyph: "😎", label: "cool" },
  { key: "sexy", glyph: "🔥", label: "sexy" },
  { key: "trustworthy", glyph: "🤝", label: "trustworthy" },
];

/**
 * Orkut rated people 1 to 3 on an icon scale per category and showed the result
 * as a percentage, not an average. Values of 0 mean "not rated yet".
 */
export default function RateButtons({ ratedId, mine }: { ratedId: string; mine?: Partial<Record<Field, number>> }) {
  const router = useRouter();
  const [mineState, setMineState] = useState<Partial<Record<Field, number>>>(mine ?? {});
  const [busy, setBusy] = useState<Field | null>(null);
  const [err, setErr] = useState("");

  async function rate(field: Field, value: number) {
    setErr("");
    setBusy(field);
    try {
      await rateUser(ratedId, field, value);
      setMineState((s) => ({ ...s, [field]: value }));
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="text-center">
      <p className="mb-1 text-[11px] font-bold text-gray-600">rate this person</p>
      <div className="space-y-1">
        {CATS.map((c) => {
          const current = mineState[c.key] ?? 0;
          return (
            <div key={c.key} className="flex items-center justify-center gap-1">
              <span className="w-16 text-left text-[10px] text-gray-500">{c.label}</span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => rate(c.key, n)}
                  disabled={busy === c.key}
                  title={`${c.label}: ${n} of 3`}
                  aria-label={`Rate ${c.label} ${n} of 3`}
                  className="rounded px-0.5 text-sm leading-none disabled:opacity-50 hover:bg-[#d4ddf5]"
                  style={{ filter: n <= current ? "none" : "grayscale(1)", opacity: n <= current ? 1 : 0.35 }}
                >
                  {c.glyph}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
    </div>
  );
}