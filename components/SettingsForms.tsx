"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, deleteAccountAction, logoutEverywhereAction, logoutHereAction } from "@/lib/settings-actions";

export function PasswordForm() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  return (
    <form
      className="space-y-2 p-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("");
        const fd = new FormData(e.currentTarget);
        try {
          await changePasswordAction(String(fd.get("current") ?? ""), String(fd.get("next") ?? ""));
          setMsg("Password changed. Other devices logged out.");
          (e.target as HTMLFormElement).reset();
          router.refresh();
        } catch (e: unknown) {
          setMsg(e instanceof Error ? e.message : "Failed");
        }
      }}
    >
      <input name="current" type="password" required placeholder="current password" className="w-full rounded border border-gray-300 px-2 py-1" />
      <input name="next" type="password" required minLength={6} placeholder="new password (6+)" className="w-full rounded border border-gray-300 px-2 py-1" />
      <button className="rounded bg-[#e5ecf9] px-3 py-1 text-xs font-bold">change password</button>
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
    </form>
  );
}

export function DangerZone() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-2 p-3 text-sm">
      <form action={logoutEverywhereAction}>
        <button className="rounded bg-gray-100 px-3 py-1 text-xs font-bold">log out everywhere</button>
      </form>
      <form action={logoutHereAction}>
        <button className="rounded bg-gray-100 px-3 py-1 text-xs font-bold">log out here</button>
      </form>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg("");
          try {
            await deleteAccountAction(confirm);
            router.push("/");
          } catch (e: unknown) {
            setMsg(e instanceof Error ? e.message : "Failed");
          }
        }}
        className="rounded border border-red-200 bg-red-50 p-2"
      >
        <p className="text-xs font-bold text-red-700">delete my account + all my data (cascades)</p>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required placeholder="confirm with password" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        <button className="mt-1 rounded bg-red-600 px-3 py-1 text-xs font-bold text-white">delete forever</button>
        {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
      </form>
    </div>
  );
}
