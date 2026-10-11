import Link from "next/link";
import { ilike, eq, or, sql } from "drizzle-orm";
import Header from "@/components/Header";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { communities, posts, topics, users } from "@/drizzle/schema";
import { avatarFor } from "@/lib/orkut";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const like = `%${query}%`;

  const [people, groups, foundTopics] = query
    ? await Promise.all([
        db.select().from(users).where(ilike(users.name, like)).limit(20),
        db.select().from(communities).where(ilike(communities.name, like)).limit(20),
        // Orkut searched forum topics too, not just names. A topic with a
        // matching reply counts even when its own title does not match, so the
        // reply check is an EXISTS rather than a join.
        db
          .select({ topic: topics, community: communities })
          .from(topics)
          .innerJoin(communities, eq(communities.id, topics.communityId))
          .where(
            or(
              ilike(topics.title, like),
              sql`EXISTS (SELECT 1 FROM ${posts} WHERE ${posts.topicId} = ${topics.id} AND ${posts.body} ILIKE ${like})`
            )
          )
          .limit(20),
      ])
    : [[], [], []];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box"><div className="orkut-box-header">search orkut</div>
          <form className="flex gap-2 p-3" action="/search">
            <input name="q" defaultValue={query} placeholder="people, communities, forum topics..." className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm" />
            <button className="rounded px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--orkut-pink)" }}>search</button>
          </form>
        </div>
        {query && (
          <>
            <div className="orkut-box"><div className="orkut-box-header">people ({people.length})</div>
              <div className="divide-y text-sm">
                {people.map((u) => (
                  <Link key={u.id} href={`/profile/${u.id}`} className="flex items-center gap-2 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u.avatarUrl ?? avatarFor(u.name)} alt={u.name} className="h-8 w-8 rounded border" />{u.name}
                    <span className="text-xs text-gray-500">{[u.city, u.country].filter(Boolean).join(", ")}</span>
                  </Link>
                ))}
                {people.length === 0 && <p className="p-3 text-xs text-gray-500">No people found.</p>}
              </div>
            </div>
            <div className="orkut-box"><div className="orkut-box-header">communities ({groups.length})</div>
              <div className="divide-y text-sm">
                {groups.map((c) => (
                  <Link key={c.id} href={`/communities/${c.id}`} className="orkut-link block p-2">{c.name} <span className="text-xs text-gray-500">({c.membersCount})</span></Link>
                ))}
                {groups.length === 0 && <p className="p-3 text-xs text-gray-500">No communities found.</p>}
              </div>
            </div>
            <div className="orkut-box"><div className="orkut-box-header">forum topics ({foundTopics.length})</div>
              <div className="divide-y text-sm">
                {foundTopics.map(({ topic, community }) => (
                  <Link key={topic.id} href={`/communities/${community.id}/forum/${topic.id}`} className="orkut-link block p-2">
                    {topic.title}
                    <span className="block text-xs text-gray-500">in {community.name}</span>
                  </Link>
                ))}
                {foundTopics.length === 0 && <p className="p-3 text-xs text-gray-500">No forum topics found.</p>}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}