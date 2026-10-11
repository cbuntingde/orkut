"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { beginTwoFactor, cancelTwoFactor, confirmTwoFactor, disableTwoFactor } from "@/lib/totp-actions";
import type { TwoFactorState } from "@/lib/totp-actions";

// Two-factor setup has three visible states, and the order matters: a secret is
// generated and shown, only a working code turns 2FA on, and only then are
// recovery codes issued. Nothing here reports success before it is true.

export default function TwoFactorPanel({ state, recoveryLeft }: { state: TwoFactorState; recoveryLeft: number }) {
  const router = useRouter();
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, then?: () => void) {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      await fn();
      then?.();
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
  const btn = "rounded bg-[#e5ecf9] px-3 py-1 text-xs font-bold disabled:opacity-50";

  // Recovery codes are shown exactly once. Hiding them afterwards is not a
  // feature gap, it is the whole point: the server only keeps hashes.
  if (recoveryCodes.length) {
    return (
      <div className="space-y-2 p-3 text-sm">
        <p className="text-xs text-gray-700">
          Two-factor is on. Save these one-time recovery codes somewhere safe. Each one
          works a single time, and they are not shown again.
        </p>
        <ul className="grid grid-cols-2 gap-1 rounded border border-gray-300 bg-gray-50 p-2 font-mono text-xs">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          className={btn}
          onClick={() => { setRecoveryCodes([]); setCode(""); }}
        >
          I have saved them
        </button>
      </div>
    );
  }

  if (state.enabled) {
    return (
      <div className="space-y-2 p-3 text-sm">
        <p className="text-xs text-gray-700">
          On. Your login asks for a 6-digit code after the password.
          {recoveryLeft > 0 ? ` ${recoveryLeft} recovery codes left.` : " No recovery codes left."}
          {recoveryLeft === 0 && " Turn 2FA off and on again to mint new ones."}
        </p>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="password, to turn this off" className={input}
        />
        <button
          className={btn} disabled={busy || password.length === 0}
          onClick={() => run(async () => {
            const res = await disableTwoFactor(password);
            if (!res.ok) setErr(res.error ?? "Failed");
            else { setPassword(""); setMsg("Two-factor turned off."); }
          })}
        >
          turn off two-factor
        </button>
        {err && <p className="text-xs font-bold text-red-600">{err}</p>}
        {msg && <p className="text-xs text-green-700">{msg}</p>}
      </div>
    );
  }

  // Setup in progress: the secret exists but 2FA is not on yet.
  if (otpauth) {
    return (
      <div className="space-y-2 p-3 text-sm">
        <p className="text-xs text-gray-700">
          Add this to Google Authenticator, Authy, or any TOTP app, then enter the
          6-digit code it shows. Two-factor does not switch on until that code works.
        </p>
        <p className="break-all rounded border border-gray-200 bg-gray-50 p-2 font-mono text-[10px] text-gray-600">
          {otpauth}
        </p>
        <input
          value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
          autoComplete="one-time-code" placeholder="6-digit code" className={input}
        />
        <div className="flex gap-2">
          <button
            className={btn} disabled={busy || code.length < 6}
            onClick={() => run(async () => {
              const res = await confirmTwoFactor(code);
              if (!res.ok) setErr(res.error ?? "Failed");
              else if (res.recoveryCodes) { setRecoveryCodes(res.recoveryCodes); setOtpauth(""); }
            })}
          >
            confirm and turn on
          </button>
          <button
            className="rounded px-3 py-1 text-xs font-bold text-gray-500"
            onClick={() => run(cancelTwoFactor, () => setOtpauth(""))}
          >
            cancel
          </button>
        </div>
        {err && <p className="text-xs font-bold text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 text-sm">
      {state.unavailable ? (
        <p className="text-xs font-bold text-red-600">
          This server has no TOTP encryption key configured, so 2FA cannot be enabled.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-700">
            Ask for a 6-digit code after your password, on top of it. Needs an
            authenticator app on your phone.
          </p>
          <button
            className={btn} disabled={busy}
            onClick={() => run(async () => {
              const res = await beginTwoFactor();
              if (!res.ok) setErr(res.error ?? "Failed");
              else if (res.otpauth) setOtpauth(res.otpauth);
            })}
          >
            turn on two-factor
          </button>
          {state.pending && (
            <p className="text-xs text-amber-700">Setup was started but never confirmed. Start again.</p>
          )}
          {err && <p className="text-xs font-bold text-red-600">{err}</p>}
        </>
      )}
    </div>
  );
}