"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTheme } from "@/lib/settings-actions";
import { THEMES, THEME_KEYS, type ThemeKey } from "@/lib/orkut";

export default function ThemePicker({ current }: { current: string }) {
  const router = useRouter();
  const [theme, setLocal] = useState<string>(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div className="p-3 text-xs">
      <p className="mb-2 text-xs font-bold text-gray-600">profile theme</p>
      <div className="space-y-1">
        {THEME_KEYS.map((k: ThemeKey) => {
          const t = THEMES[k];
          return (
            <button
              key={k}
              disabled={busy}
              onClick={async () => {
                setErr("");
                setBusy(true);
                setLocal(k);
                try {
                  await setTheme(k);
                  router.refresh();
                } catch (e: unknown) {
                  setErr(e instanceof Error ? e.message : "Failed");
                  setLocal(current);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex w-full items-center gap-2 rounded border p-1.5 text-left disabled:opacity-50"
              style={{
                borderColor: theme === k ? t.accent : "#e5e7eb",
                background: theme === k ? t.shell : "#fff",
              }}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-black" style={{ background: t.accent, color: "#fff" }}>
                o
              </span>
              <span style={{ color: t.ink }}>{t.label}</span>
              {theme === k && <span className="ml-auto text-[10px]">✓</span>}
            </button>
          );
        })}
      </div>
      {err && <p className="mt-1 text-red-600">{err}</p>}
    </div>
  );
}