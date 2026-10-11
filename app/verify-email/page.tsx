import Link from "next/link";
import Header from "@/components/Header";
import { consumeVerificationToken } from "@/lib/email-verification";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const result = token ? await consumeVerificationToken(token) : ({ ok: false, reason: "invalid" } as const);

  const heading =
    result.ok ? "address confirmed" :
    result.reason === "used" ? "that link was already used" :
    result.reason === "expired" ? "that link has expired" :
    "that link is not valid";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-md flex-1 p-4">
        <div className="orkut-box p-6 text-center">
          <h1 className="text-xl font-black" style={{ color: result.ok ? "#2e7d4f" : "#e2603c" }}>
            {heading}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {result.ok
              ? "Your profile is ready. Welcome to orkut."
              : "Ask for a new link from the sign-in page and try again."}
          </p>
          <div className="mt-4 flex justify-center gap-2 text-sm">
            <Link className="orkut-link font-bold" href="/login">login</Link>
            <Link className="orkut-link" href="/">home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}