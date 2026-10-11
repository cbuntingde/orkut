"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { strengthScore, strengthLabel, MIN_LENGTH } from "@/lib/password";

const BAR_COLORS = ["", "#dc2626", "#ea580c", "#ca8a04", "#16a34a"];

/**
 * The double-submit half of the CSRF defence. The server sets this cookie on
 * every page render; echoing it into a header proves the request came from a
 * page that could read it, which a cross-origin caller cannot do.
 */
function csrfHeaders(): Record<string, string> {
  const match = document.cookie.match(/(?:^|;\s*)orkut_csrf=([^;]*)/);
  return match ? { "Content-Type": "application/json", "x-csrf-token": decodeURIComponent(match[1]) } : { "Content-Type": "application/json" };
}

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devLink, setDevLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Set once the password is accepted but a second factor is still owed.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  const score = useMemo(() => (mode === "signup" ? strengthScore(password) : 0), [mode, password]);
  const mismatch = mode === "signup" && confirm.length > 0 && confirm !== password;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotice("");
    setDevLink("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify(Object.fromEntries(fd.entries())),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    // Password was right but the account has two-factor on. No session exists
    // yet, so the form switches to asking for the code.
    if (data.needTwoFactor) {
      setNeedsCode(true);
      setNotice("Enter the 6-digit code from your authenticator app.");
      return;
    }
    if (data.message) setNotice(data.message);
    setDevLink(data.devVerificationLink ?? "");
    // Signup deliberately does not log you in: the address has to be confirmed
    // first, so there is no session cookie yet.
    if (!data.message) {
      router.push("/home");
      router.refresh();
    }
  }

  async function onVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/2fa", {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong");
    router.push("/home");
    router.refresh();
  }

  async function onResend() {
    setError("");
    const fd = new FormData();
    fd.append("email", String(new FormData(document.querySelector("form") as HTMLFormElement).get("email") ?? ""));
    setLoading(true);
    const res = await fetch("/api/auth/resend", {
      method: "POST",
      headers: csrfHeaders(),
      body: JSON.stringify({ email: fd.get("email") }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Failed");
    setNotice(data.message ?? "Sent.");
  }

  const pwClass = "rounded border border-gray-300 px-3 py-2 text-sm";

  return (
    <>
      {mode === "signup" && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
          <input name="name" required maxLength={100} placeholder="full name" className={pwClass} autoComplete="name" />
          <input name="email" type="email" required placeholder="email" className={pwClass} autoComplete="email" />
          <input
            name="password" type="password" required
            placeholder={`password (min ${MIN_LENGTH} chars)`}
            className={pwClass} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />

          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-1.5 flex-1 rounded" style={{ background: i <= score ? BAR_COLORS[score] : "#e5e7eb" }} />
            ))}
          </div>
          <p className="text-xs text-gray-600" style={{ minHeight: "1rem" }}>
            {password ? `strength: ${strengthLabel(score)}` : `use at least ${MIN_LENGTH} characters`}
          </p>

          <input
            name="confirmPassword" type="password" required placeholder="confirm password"
            className={pwClass} autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && <p className="text-xs font-bold text-red-600">Passwords do not match</p>}

          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          {notice && (
            <div className="rounded bg-[#eef7f1] p-2 text-xs text-green-800">
              <p>{notice}</p>
              {devLink && (
                <p className="mt-1 break-all text-[10px] text-gray-600">
                  dev only: <a className="orkut-link" href={devLink}>{devLink}</a>
                </p>
              )}
            </div>
          )}
          <button disabled={loading} className="rounded px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#ed2590" }}>
            {loading ? "..." : "join orkut"}
          </button>
        </form>
      )}

      {mode === "login" && needsCode && (
        <form onSubmit={onVerifyCode} className="flex flex-col gap-3 p-4">
          <p className="text-xs text-gray-600">Two-step verification</p>
          <input
            name="code" inputMode="numeric" autoComplete="one-time-code" required
            placeholder="6-digit code, or a recovery code"
            className={pwClass} value={code} onChange={(e) => setCode(e.target.value)}
          />
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          {notice && <p className="rounded bg-[#eef7f1] p-2 text-xs text-green-800">{notice}</p>}
          <button disabled={loading} className="rounded px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#ed2590" }}>
            {loading ? "..." : "verify and login"}
          </button>
          <button
            type="button" onClick={() => { setNeedsCode(false); setCode(""); setError(""); setNotice(""); }}
            className="text-[11px] text-gray-500 underline"
          >
            use a different account
          </button>
        </form>
      )}

      {mode === "login" && !needsCode && (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
          <input name="email" type="email" required placeholder="email" className={pwClass} autoComplete="email" />
          <input
            name="password" type="password" required placeholder="password"
            className={pwClass} autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          {notice && <p className="rounded bg-[#eef7f1] p-2 text-xs text-green-800">{notice}</p>}
          <button disabled={loading} className="rounded px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#ed2590" }}>
            {loading ? "..." : "login to orkut"}
          </button>
          <button type="button" onClick={onResend} disabled={loading} className="text-[11px] text-gray-500 underline">
            need a new verification link?
          </button>
        </form>
      )}
    </>
  );
}