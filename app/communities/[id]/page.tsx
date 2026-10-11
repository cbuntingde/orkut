import Link from "next/link";
import { and, desc, eq, ne, or } from "drizzle-orm";
import Header from "@/components/Header";
import { NewTopicForm } from "@/components/ForumForms";
import { NewPollForm, PollCard } from "@/components/PollForms";
import { NewEventForm, EventCard } from "@/components/EventForms";
import { AddVideoForm, VideoList } from "@/components/VideoForms";
import { getEvents } from "@/lib/social-actions";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toggleCommunityMembership, requireRole } from "@/lib/community-actions";
import { getPolls } from "@/lib/poll-actions";
import { getCommunityVideos } from "@/lib/video-actions";
import { communities, communityMembers, topics } from "@/drizzle/schema";

export default async function CommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  const c = (await db.select().from(communities).where(eq(communities.id, id)).limit(1))[0];
  if (!c) return <div className="p-8">Community not found.</div>;

  const members = await db.select().from(communityMembers).where(eq(communityMembers.communityId, id));
  const isMember = me ? members.some((m) => m.userId === me.id) : false;
  const { isModerator } = me
    ? await requireRole(id).catch(() => ({ isModerator: false }))
    : { isModerator: false };

  const list = await db.select().from(topics).where(eq(topics.communityId, id)).orderBy(desc(topics.createdAt)).limit(30);
  const pollList = await getPolls(id, me?.id);
  const eventList = await getEvents(id, me?.id);
  const videoList = await getCommunityVideos(id);

  // Related communities: same category, otherwise same language, never itself.
  // and()/or() both drop undefined entries, so a missing category or language
  // simply narrows rather than breaks the filter.
  const related = await db
    .select()
    .from(communities)
    .where(
      and(
        ne(communities.id, id),
        or(
          c.category ? eq(communities.category, c.category) : undefined,
          c.language ? eq(communities.language, c.language) : undefined,
        ),
      ),
    )
    .orderBy(desc(communities.membersCount))
    .limit(6);

  const modCount = members.filter((m) => m.role === "owner" || m.role === "moderator").length;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box p-4">
          <h1 className="text-xl font-black" style={{ color: "#ed2590" }}>{c.name}</h1>
          <p className="text-xs text-gray-500">
            {c.membersCount} members{c.category ? ` · ${c.category}` : ""}{c.language ? ` · ${c.language}` : ""}
            {` · joins: ${c.joinPolicy}`}
          </p>
          {c.description && <p className="mt-2 text-sm">{c.description}</p>}
          {c.rules && (
            <div className="mt-2 rounded bg-[#fff8e6] p-2 text-xs">
              <p className="font-bold">community rules</p>
              <p className="whitespace-pre-wrap text-gray-700">{c.rules}</p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {me && (
              <form action={toggleCommunityMembership.bind(null, id)}>
                <button
                  className="rounded bg-[#e5ecf9] px-3 py-1 text-xs font-bold disabled:opacity-50"
                  disabled={c.joinPolicy === "closed" && !isMember}
                >
                  {isMember ? "leave community" : c.joinPolicy === "closed" ? "closed" : c.joinPolicy === "approval" ? "request to join" : "join community"}
                </button>
              </form>
            )}
            <Link href={`/communities/${id}/members`} className="orkut-link text-xs">
              members ({members.length}){modCount ? ` · ${modCount} moderator${modCount === 1 ? "" : "s"}` : ""} →
            </Link>
            {isModerator && (
              <Link href={`/communities/${id}/members`} className="text-xs font-bold" style={{ color: "#ed2590" }}>
                ★ moderator tools
              </Link>
            )}
          </div>
          {c.joinPolicy === "approval" && !isMember && (
            <p className="mt-1 text-xs text-gray-500">This community is approval-only. A moderator has to add you.</p>
          )}
        </div>

        <div className="orkut-box"><div className="orkut-box-header">forum topics ({list.length})</div>
          {me && isMember && <NewTopicForm communityId={id} />}
          <div className="divide-y text-sm">
            {list.map((t) => (
              <Link key={t.id} href={`/communities/${id}/forum/${t.id}`} className="orkut-link block p-3">
                {t.title}
                <span className="block text-xs text-gray-500">{new Date(t.createdAt).toLocaleString()}</span>
              </Link>
            ))}
            {list.length === 0 && <p className="p-3 text-xs text-gray-500">No topics yet.</p>}
          </div>
        </div>

        <div className="orkut-box"><div className="orkut-box-header">polls ({pollList.length})</div>
          {me && isMember && <NewPollForm communityId={id} />}
          <div className="divide-y">
            {pollList.map(({ poll, options, total, myVote }) => (
              <PollCard key={poll.id} communityId={id} pollId={poll.id} question={poll.question} options={options} total={total} myVoteId={myVote?.optionId} />
            ))}
            {pollList.length === 0 && <p className="p-3 text-xs text-gray-500">No polls yet.</p>}
          </div>
        </div>

        <div className="orkut-box"><div className="orkut-box-header">events ({eventList.length})</div>
          {me && isMember && <NewEventForm communityId={id} />}
          <div className="divide-y">
            {eventList.map(({ event, count, going }) => (
              <EventCard key={event.id} communityId={id} eventId={event.id} title={event.title} location={event.location} startsAt={event.startsAt} description={event.description} count={count} going={going} />
            ))}
            {eventList.length === 0 && <p className="p-3 text-xs text-gray-500">No events yet.</p>}
          </div>
        </div>

        <div className="orkut-box">
          <div className="orkut-box-header">videos ({videoList.length})</div>
          {me && isMember && <AddVideoForm communityId={id} />}
          <VideoList videos={videoList} />
        </div>

        {related.length > 0 && (
          <div className="orkut-box">
            <div className="orkut-box-header">related communities</div>
            <div className="grid grid-cols-2 gap-2 p-3 text-xs md:grid-cols-3">
              {related.map((r) => (
                <Link key={r.id} href={`/communities/${r.id}`} className="rounded border p-2 hover:bg-gray-50">
                  <span className="orkut-link font-bold">{r.name}</span>
                  <span className="block text-gray-500">{r.membersCount} members{r.category ? ` · ${r.category}` : ""}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}