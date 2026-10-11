import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import Header from "@/components/Header";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fans, users } from "@/drizzle/schema";
import { avatarFor } from "@/lib/orkut";

export default async function FansPage() {
  const me = await requireUser();
  const rows = await db
    .select({ fan: fans, user: users })
    .from(fans)
    .innerJoin(users, eq(users.id, fans.fanId))
    .where(eq(fans.starId, me.id))
    .orderBy(desc(fans.createdAt));

  const iFan = await db
    .select()
    .from(fans)
    .where(eq(fans.fanId, me.id));

  const theirIds = iFan.map((f) => f.starId);
  const mutual = theirIds.length
    ? await db.select().from(fans).where(eq(fans.fanId, me.id))
    : [];
  const mutualIds = new Set(mutual.map((f) => f.starId));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box">
          <div className="orkut-box-header">my fans ({rows.length})</div>
          <div className="grid grid-cols-2 gap-2 p-3 text-sm md:grid-cols-4">
            {rows.map(({ user }) => (
              <Link key={user.id} href={`/profile/${user.id}`} className="flex items-center gap-2 rounded border p-2 hover:bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.avatarUrl ?? avatarFor(user.name)} alt={user.name} className="h-10 w-10 rounded border" />
                <span>
                  {user.name}
                  {mutualIds.has(user.id) && <span className="ml-1 text-[10px] font-bold text-[#ed2590]">★</span>}
                </span>
              </Link>
            ))}
            {rows.length === 0 && <p className="col-span-4 p-2 text-xs text-gray-500">No fans yet — be likeable.</p>}
          </div>
        </div>

        <div className="orkut-box">
          <div className="orkut-box-header">people i fan ({iFan.length})</div>
          <div className="grid grid-cols-2 gap-2 p-3 text-sm md:grid-cols-4">
            {theirIds.length === 0 && <p className="col-span-4 p-2 text-xs text-gray-500">You have not fanned anyone yet.</p>}
            {theirIds.map((id) => (
              <FansLink key={id} id={id} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

async function FansLink({ id }: { id: string }) {
  const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u) return null;
  return (
    <Link href={`/profile/${u.id}`} className="flex items-center gap-2 rounded border p-2 hover:bg-gray-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={u.avatarUrl ?? avatarFor(u.name)} alt={u.name} className="h-10 w-10 rounded border" />
      <span>{u.name}</span>
    </Link>
  );
}