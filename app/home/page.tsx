import Link from "next/link";
import { and, desc, eq, or, sql } from "drizzle-orm";
import Header from "@/components/Header";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getFriendSuggestions } from "@/lib/discovery-actions";
import { friendships, profileVisits, scraps, users, communityMembers, communities } from "@/drizzle/schema";
import { profileCompleteness, todaysFortune, avatarFor } from "@/lib/orkut";
import ScrapText from "@/components/ScrapText";

export default async function HomePage() {
  const me = await requireUser();

  // Friendship is one row with two sides, so the friend is whichever side this
  // user is not. Joining only on addresseeId returned the signed-in user as
  // their own friend whenever they were the addressee.
  const myFriends = await db
    .select({ friendship: friendships, friend: users })
    .from(friendships)
    .innerJoin(
      users,
      eq(
        users.id,
        sql`CASE WHEN ${friendships.requesterId} = ${me.id} THEN ${friendships.addresseeId} ELSE ${friendships.requesterId} END`
      )
    )
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, me.id))
      )
    );

  const recentScraps = await db
    .select()
    .from(scraps)
    .where(eq(scraps.ownerId, me.id))
    .orderBy(desc(scraps.createdAt))
    .limit(5);

  const visits = await db
    .select({ visit: profileVisits, visitor: users })
    .from(profileVisits)
    .innerJoin(users, eq(users.id, profileVisits.visitorId))
    .where(eq(profileVisits.visitedId, me.id))
    .orderBy(desc(profileVisits.visitedAt))
    .limit(5);

  const pctOfProfile = profileCompleteness(me);

  // Orkut's home page had a "my communities" box; it is where people actually
  // spent time, so it belongs next to friends and scraps.
  const myCommunities = await db
    .select({ community: communities, member: communityMembers })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(eq(communityMembers.userId, me.id))
    .orderBy(desc(communities.membersCount))
    .limit(8);

  const suggestions = await getFriendSuggestions(8).catch(() => []);
  // Birthdays within 7 days either side. Matches month/day against a generated
  // 15-day window, so it stays correct across month and year boundaries. A plain
  // date range would be wrong here: it compares the birth year too, and it breaks
  // the same way the old day-of-month arithmetic did whenever the window crossed
  // into the next month.
  const birthdays = await db.select().from(users).where(
    sql`${users.dob} IS NOT NULL AND to_char(${users.dob}, 'MM-DD') IN (
          SELECT to_char(d, 'MM-DD')
          FROM generate_series((NOW() - interval '7 days')::date,
                               (NOW() + interval '7 days')::date,
                               interval '1 day') AS t(d)
        )`
  ).limit(10).catch(() => []);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 p-4 md:grid-cols-[220px_1fr_260px]">
        <aside className="flex flex-col gap-4">
          <div className="orkut-box p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={me.avatarUrl ?? avatarFor(me.name)} alt={me.name} className="mx-auto h-28 w-28 rounded border" />
            <p className="mt-2 font-bold">{me.name}</p>
            <p className="text-xs text-gray-500">{me.status ?? "hello, orkut!"}</p>
            <Link href={`/profile/${me.id}`} className="orkut-link text-xs">view my profile →</Link>
          </div>
          <div className="orkut-box">
            <div className="orkut-box-header">profile completeness</div>
            <div className="p-3 text-xs">
              <div className="h-2 rounded bg-gray-200"><div className="h-2 rounded" style={{ width: `${pctOfProfile}%`, background: "#ed2590" }} /></div>
              <p className="mt-1">{pctOfProfile}% complete — <Link className="orkut-link" href={`/profile/${me.id}/edit`}>edit profile</Link></p>
              <p className="mt-1">lucky: <b>{me.luckyPct}%</b> | views: <b>{me.profileViews}</b> | scraps: <b>{me.scrapsCount}</b></p>
            </div>
          </div>
        </aside>

        <section className="flex flex-col gap-4">
          <div className="orkut-box">
            <div className="orkut-box-header">today&apos;s fortune</div>
            <p className="p-3 text-sm italic">{todaysFortune(me.id + new Date().toDateString())}</p>
          </div>
          <div className="orkut-box">
            <div className="orkut-box-header">my latest scraps ({recentScraps.length})</div>
            <div className="divide-y text-sm">
              {recentScraps.length === 0 && <p className="p-3 text-xs text-gray-500">No scraps yet — ask friends to scrap you!</p>}
              {recentScraps.map((s) => (
                <div key={s.id} className="p-3"><ScrapText body={s.body} /><p className="text-xs text-gray-500">{new Date(s.createdAt).toLocaleString()}</p></div>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="orkut-box">
            <div className="orkut-box-header">last 5 visitors</div>
            <div className="p-2 text-xs">
              {visits.length === 0 && <p className="text-gray-500">No visitors yet.</p>}
              {visits.map(({ visit, visitor }) => (
                <Link key={visit.id} href={`/profile/${visitor.id}`} className="orkut-link block py-0.5">{visitor.name}</Link>
              ))}
            </div>
          </div>
          <div className="orkut-box">
            <div className="orkut-box-header">my friends ({myFriends.length})</div>
            <div className="grid grid-cols-4 gap-1 p-2">
              {myFriends.slice(0, 8).map(({ friend }) => (
                <Link key={friend.id} href={`/profile/${friend.id}`} title={friend.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={friend.avatarUrl ?? avatarFor(friend.name)} alt={friend.name} className="h-12 w-12 rounded border" />
                </Link>
              ))}
            </div>
            <Link href="/friends" className="orkut-link block p-2 text-xs">view all →</Link>
          </div>
          <div className="orkut-box">
            <div className="orkut-box-header">you may know ({suggestions.length})</div>
            <div className="grid grid-cols-4 gap-1 p-2">
              {suggestions.map(({ user, mutual }) => (
                <Link key={user.id} href={`/profile/${user.id}`} title={`${user.name} (${mutual} mutual)`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.avatarUrl ?? avatarFor(user.name)} alt={user.name} className="h-12 w-12 rounded border" />
                </Link>
              ))}
            </div>
            {suggestions.length === 0 && <p className="p-2 text-xs text-gray-500">Add friends to get suggestions.</p>}
          </div>
          <div className="orkut-box">
            <div className="orkut-box-header">birthdays this week ({birthdays.length})</div>
            <div className="p-2 text-xs">
              {birthdays.map((b) => (
                <Link key={b.id} href={`/profile/${b.id}`} className="orkut-link block">🎂 {b.name}{b.dob ? ` — ${new Date(b.dob).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</Link>
              ))}
              {birthdays.length === 0 && <p className="text-gray-500">No birthdays — add your dob in edit profile.</p>}
            </div>
          </div>
          <div className="orkut-box">
            <div className="orkut-box-header">my communities ({myCommunities.length})</div>
            <div className="p-2 text-xs">
              {myCommunities.map(({ community, member }) => (
                <Link key={community.id} href={`/communities/${community.id}`} className="orkut-link block py-0.5">
                  {member.role !== "member" ? "★ " : ""}{community.name}
                  <span className="text-gray-400"> ({community.membersCount})</span>
                </Link>
              ))}
              {myCommunities.length === 0 && <p className="text-gray-500">Join some communities →</p>}
              <Link href="/communities" className="orkut-link mt-1 block text-gray-500">browse all →</Link>
            </div>
          </div>
          <div className="orkut-box">
            <div className="orkut-box-header">my data</div>
            <a href="/api/takeout" download="orkut-takeout.json" className="orkut-link block p-2 text-xs">⬇ download my Takeout (JSON)</a>
          </div>
        </aside>
      </main>
    </div>
  );
}
