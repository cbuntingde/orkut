import Link from "next/link";
import ScrapForm from "./ScrapForm";
import TestimonialForm from "./TestimonialForm";
import CrushButton from "./CrushButton";
import RateButtons from "./RateButtons";
import { addFriend, moderateTestimonial, deleteScrap } from "@/lib/actions";
import FanButton from "./FanButton";
import ScrapText from "./ScrapText";
import { BlockButton, ReportForm } from "./SafetyForms";
import { isBlocked } from "@/lib/safety-actions";
import { getCrushState } from "@/lib/nostalgia-actions";
import { profileCompleteness, avatarFor } from "@/lib/orkut";
import { getSessionUser } from "@/lib/auth";
import type { getProfileData } from "@/lib/profile-data";

type Data = NonNullable<Awaited<ReturnType<typeof getProfileData>>>;

export default async function ProfileView({ data, id, isMine, loggedIn }: { data: Data; id: string; isMine: boolean; loggedIn: boolean }) {
  const { u, myScraps, visibleScrapCount, accepted, pending, fanRows, ratingRows, visits, isFan, friendRows, myRatings, viewsDay, viewsWeek, isFriend } = data;
  const crush = !isMine ? await getCrushState(id).catch(() => ({ crushed: false, mutual: false })) : null;
  const blocked = !isMine ? await getSessionUser().then((m) => m ? isBlocked(m.id, id) : false) : false;
  // Orkut aggregated cool/sexy/trustworthy as a percentage of the maximum, not a
  // decimal average, so three out of three from one rater reads 100%.
  const pct = (f: "cool" | "sexy" | "trustworthy") => {
    if (!ratingRows.length) return null;
    const sum = ratingRows.reduce((a, r) => a + r[f], 0);
    return Math.round((sum / (ratingRows.length * 3)) * 100);
  };
  const pctOfProfile = profileCompleteness(u);
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 gap-4 p-4 md:grid-cols-[240px_1fr_260px]">
      <aside className="flex flex-col gap-4">
        <div className="orkut-box p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u.avatarUrl ?? avatarFor(u.name)} alt={u.name} className="mx-auto h-32 w-32 rounded border" />
          <p className="mt-2 text-lg font-bold">{u.name}</p>
          <p className="text-xs text-gray-500">{u.status ?? ""}</p>
          <p className="mt-1 text-xs">{[u.city, u.country].filter(Boolean).join(", ")}</p>
          {!isMine && loggedIn && (
            <div className="mt-2 flex flex-col gap-1">
              <form action={addFriend.bind(null, id)}><button className="w-full rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">+ add friend</button></form>
              <FanButton starId={id} isFan={isFan} isFriend={isFriend} />
                {crush && <CrushButton crusheeId={id} initial={crush} />}
                <RateButtons ratedId={id} mine={myRatings ? { cool: myRatings.cool, sexy: myRatings.sexy, trustworthy: myRatings.trustworthy } : undefined} />
                <BlockButton blockedId={id} initial={blocked} />
                <ReportForm targetType="profile" targetId={id} />
              </div>
          )}
          {isMine && <Link href={`/profile/${id}/edit`} className="orkut-link mt-2 block text-xs">edit profile</Link>}
          <Link href={`/profile/${id}/photos`} className="orkut-link mt-1 block text-xs">photos</Link>
          <Link href={`/profile/${id}/videos`} className="orkut-link mt-1 block text-xs">videos</Link>
          {!isMine && loggedIn && <Link href={`/messages/${id}`} className="orkut-link mt-1 block text-xs">message</Link>}
        </div>
        <div className="orkut-box"><div className="orkut-box-header">stats</div>
          <div className="space-y-1 p-3 text-xs">
            <p>complete <b>{pctOfProfile}%</b> | fans <b>{fanRows.length}</b> | views <b>{u.profileViews}</b></p>
            <p className="text-gray-500">yesterday <b>{viewsDay}</b> · last week <b>{viewsWeek}</b> · all time <b>{u.profileViews}</b></p>
            <p>cool <b>{pct("cool") === null ? "—" : `${pct("cool")}%`}</b> sexy <b>{pct("sexy") === null ? "—" : `${pct("sexy")}%`}</b> trust <b>{pct("trustworthy") === null ? "—" : `${pct("trustworthy")}%`}</b></p>
            <p>relationship <b>{u.relationship ?? "—"}</b> lucky <b>{u.luckyPct}%</b></p>
          </div>
        </div>
        <div className="orkut-box"><div className="orkut-box-header">friends ({friendRows.length})</div>
          <div className="grid grid-cols-4 gap-1 p-2">
            {friendRows.map(({ friend, friendship }) => (
              <Link
                key={friend.id}
                href={`/profile/${friend.id}`}
                title={`${friend.name} (${friendship.tier})`}
                className={friendship.tier === "best" ? "ring-2 ring-[#ed2590]" : ""}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={friend.avatarUrl ?? avatarFor(friend.name)} alt={friend.name} className="h-12 w-12 rounded border" />
              </Link>
            ))}
            {friendRows.length === 0 && <p className="col-span-4 text-gray-500">no friends yet</p>}
          </div>
          <Link href="/friends" className="orkut-link block p-2 text-xs">view all →</Link>
        </div>
        <div className="orkut-box"><div className="orkut-box-header">visitors</div>
          <div className="p-2 text-xs">
            {visits.map(({ visit, visitor }) => <Link key={visit.id} href={`/profile/${visitor.id}`} className="orkut-link block">{visitor.name}</Link>)}
            {visits.length === 0 && <p className="text-gray-500">none yet</p>}
          </div>
        </div>
      </aside>
      <section className="flex flex-col gap-4">
        <div className="orkut-box"><div className="orkut-box-header">about</div>
          <div className="space-y-1 p-3 text-sm">
            <p><b>about:</b> {u.about ?? "—"}</p>
            <p><b>interests:</b> {u.interests ?? "—"}</p>
            <p><b>music:</b> {u.music ?? "—"}</p>
            <p><b>movies:</b> {u.movies ?? "—"}</p>
            <p><b>books:</b> {u.books ?? "—"}</p>
          </div>
        </div>
        <div className="orkut-box"><div className="orkut-box-header">scrapbook ({visibleScrapCount})</div>
          {loggedIn && <ScrapForm ownerId={id} />}
          <div className="divide-y text-sm">
            {myScraps.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-2 p-3">
                <div><ScrapText body={s.body} /><p className="text-xs text-gray-500">{new Date(s.createdAt).toLocaleString()}{s.isPrivate ? " (private)" : ""}</p></div>
                {isMine && <form action={deleteScrap.bind(null, s.id, id)}><button className="text-xs text-red-600">delete</button></form>}
              </div>
            ))}
            {myScraps.length === 0 && <p className="p-3 text-xs text-gray-500">No scraps yet.</p>}
          </div>
        </div>
      </section>
      <aside className="flex flex-col gap-4">
        <div className="orkut-box"><div className="orkut-box-header">testimonials ({accepted.length})</div>
          <div className="space-y-2 p-3 text-xs">
            {accepted.map((t) => <blockquote key={t.id} className="border-l-2 border-pink-300 pl-2 italic">{t.body}</blockquote>)}
            {accepted.length === 0 && <p className="text-gray-500">None yet.</p>}
          </div>
          {!isMine && loggedIn && (isFriend ? (
            <TestimonialForm subjectId={id} />
          ) : (
            <p className="border-t p-3 text-xs text-gray-500">testimonials are for friends only</p>
          ))}
        </div>
        {isMine && pending.length > 0 && (
          <div className="orkut-box"><div className="orkut-box-header">pending ({pending.length})</div>
            <div className="space-y-2 p-3 text-xs">
              {pending.map((t) => (
                <div key={t.id} className="rounded bg-gray-50 p-2"><p className="italic">{t.body}</p>
                  <div className="mt-1 flex gap-2">
                    <form action={moderateTestimonial.bind(null, t.id, "accepted")}><button className="font-bold text-green-700">accept</button></form>
                    <form action={moderateTestimonial.bind(null, t.id, "rejected")}><button className="font-bold text-red-600">reject</button></form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </main>
  );
}
