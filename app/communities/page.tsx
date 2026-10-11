import Link from "next/link";
import { desc } from "drizzle-orm";
import Header from "@/components/Header";
import NewCommunityForm from "@/components/NewCommunityForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { communities } from "@/drizzle/schema";

export default async function CommunitiesPage() {
  await requireUser();
  const all = await db.select().from(communities).orderBy(desc(communities.membersCount)).limit(50);
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 p-4 md:grid-cols-[1fr_320px]">
        <div className="orkut-box"><div className="orkut-box-header">communities ({all.length})</div>
          <div className="divide-y text-sm">
            {all.map((c) => (
              <Link key={c.id} href={`/communities/${c.id}`} className="block p-3 hover:bg-gray-50">
                <span className="orkut-link font-bold">{c.name}</span>
                <span className="text-xs text-gray-500"> — {c.membersCount} members{c.category ? ` · ${c.category}` : ""}</span>
                {c.description && <p className="text-xs text-gray-600">{c.description.slice(0, 140)}</p>}
              </Link>
            ))}
            {all.length === 0 && <p className="p-3 text-xs text-gray-500">No communities yet — create the first one!</p>}
          </div>
        </div>
        <div className="orkut-box h-fit"><div className="orkut-box-header">create community</div><NewCommunityForm /></div>
      </main>
    </div>
  );
}
