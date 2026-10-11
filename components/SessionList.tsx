"use client";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/lib/settings-actions";

// One row per signed-in device. The row for this device cannot be revoked from
// here, because doing so would sign the user out mid-page with no way back
// except logging in again.
//
// `lastSeen` arrives as a ready-made string: the relative time is computed during
// the server render, because a function cannot be handed to a client component.

export type SessionRow = {
  id: string;
  device: string;
  ip: string | null;
  lastSeen: string;
  current: boolean;
};

export default function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-2 p-3 text-sm">
      <ul className="space-y-1">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">
                {s.device}
                {s.current && <span className="ml-1 font-normal text-green-700">(this device)</span>}
              </p>
              <p className="text-[10px] text-gray-500">
                {s.ip ?? "unknown address"} &middot; last active {s.lastSeen}
              </p>
            </div>
            {!s.current && (
              <form action={revokeSessionAction.bind(null, s.id)}>
                <button className="rounded bg-gray-100 px-2 py-1 text-[11px] font-bold">sign out</button>
              </form>
            )}
          </li>
        ))}
        {sessions.length === 0 && <li className="text-xs text-gray-500">No active sessions.</li>}
      </ul>

      {others > 0 && (
        <form action={revokeOtherSessionsAction}>
          <button className="rounded bg-gray-100 px-3 py-1 text-xs font-bold">
            sign out {others} other device{others === 1 ? "" : "s"}
          </button>
        </form>
      )}
    </div>
  );
}