import Link from "next/link";
import { eq, or } from "drizzle-orm";
import Header from "@/components/Header";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { acceptFriend, declineFriend, removeFriend } from "@/lib/actions";
import FriendTierSelect from "@/components/FriendTierSelect";
import { friendships, users } from "@/drizzle/schema";
import { avatarFor } from "@/lib/orkut";

export default async function FriendsPage() {
  const me = await requireUser();
  const rows = await db.select().from(friendships).where(or(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, me.id)));
  const withNames = await Promise.all(rows.map(async (f) => {
    const otherId = f.requesterId === me.id ? f.addresseeId : f.requesterId;
    const u = (await db.select().from(users).where(eq(users.id, otherId)).limit(1))[0];
    return { f, u };
  }));
  const pending = withNames.filter((x) => x.f.status === "pending" && x.f.addresseeId === me.id);
  const accepted = withNames.filter((x) => x.f.status === "accepted");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box"><div className="orkut-box-header">pending requests ({pending.length})</div>
          <div className="divide-y text-sm">
            {pending.map(({ f, u }) => u && (
              <div key={f.id} className="flex items-center justify-between p-3">
                <Link className="orkut-link" href={`/profile/${u.id}`}>{u.name}</Link>
                <div className="flex gap-1">
                  <form action={acceptFriend.bind(null, f.requesterId)}><button className="rounded bg-[#e5ecf9] px-2 py-1 text-xs font-bold">accept</button></form>
                  <form action={declineFriend.bind(null, f.requesterId)}><button className="rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">decline</button></form>
                </div>
              </div>
            ))}
            {pending.length === 0 && <p className="p-3 text-xs text-gray-500">No pending requests.</p>}
          </div>
        </div>
        <div className="orkut-box"><div className="orkut-box-header">my friends ({accepted.length})</div>
          <div className="grid grid-cols-1 gap-2 p-3 text-sm md:grid-cols-2">
            {accepted.map(({ f, u }) => u && (
              <div key={f.id} className="flex items-center gap-2 rounded border p-2">
                <Link href={`/profile/${u.id}`} className="flex flex-1 items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.avatarUrl ?? avatarFor(u.name)} alt={u.name} className="h-10 w-10 rounded border" />
                  <span>{u.name}</span>
                </Link>
                <FriendTierSelect otherId={u.id} tier={f.tier} />
                <form action={removeFriend.bind(null, u.id)}><button className="text-xs text-red-500" title="unfriend">✕</button></form>
              </div>
            ))}
            {accepted.length === 0 && <p className="p-2 text-xs text-gray-500">No friends yet.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
