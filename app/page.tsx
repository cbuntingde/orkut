import Link from "next/link";
import Header from "@/components/Header";

export default function Landing() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 p-4 md:grid-cols-[1fr_320px]">
        <div className="orkut-box p-6">
          <h1 className="text-3xl font-black" style={{ color: "#ed2590" }}>orkut</h1>
          <p className="mt-1 text-sm text-gray-600">connect with friends — an homage to Google&apos;s classic 2004 social network</p>
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
            <div className="rounded bg-[#e5ecf9] p-3"><b>scrapbooks</b><br />leave public scraps on friends&apos; profiles</div>
            <div className="rounded bg-[#e5ecf9] p-3"><b>testimonials</b><br />friends vouch for you, you approve</div>
            <div className="rounded bg-[#e5ecf9] p-3"><b>communities</b><br />join groups, forums, polls</div>
          </div>
          <p className="mt-4 text-xs text-gray-500">Faithful rebuild: profiles, fans, crush lists, visitor logs, cool/sexy/trustworthy ratings.</p>
        </div>
        <div className="orkut-box">
          <div className="orkut-box-header">login</div>
          <div className="p-4 text-sm">
            <p>Already a member?</p>
            <Link href="/login" className="orkut-link font-bold">login to orkut →</Link>
            <p className="mt-3">New here?</p>
            <Link href="/signup" className="inline-block rounded px-3 py-2 text-sm font-bold text-white" style={{ background: "#ed2590" }}>join orkut</Link>
          </div>
        </div>
      </main>
      <footer className="p-4 text-center text-xs text-gray-500">orkut clone for study/nostalgia — Next.js + Postgres + Docker</footer>
    </div>
  );
}
