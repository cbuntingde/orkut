import Link from "next/link";
import Header from "@/components/Header";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { crushes, users } from "@/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { avatarFor } from "@/lib/orkut";

export default async function CrushesPage() {
  const me = await requireUser();
  const mine = await db.select().from(crushes).where(eq(crushes.admirerId, me.id));
  const cards = await Promise.all(mine.map(async (c) => {
    const other = (await db.select().from(users).where(eq(users.id, c.crusheeId)).limit(1))[0];
    const reverse = await db.select().from(crushes)
      .where(and(eq(crushes.admirerId, c.crusheeId), eq(crushes.crusheeId, me.id))).limit(1);
    return { c, other, mutual: reverse.length > 0 };
  }));
  const mutualCount = cards.filter((x) => x.mutual).length;
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box"><div className="orkut-box-header">my crush list ({cards.length}) — {mutualCount} mutual</div>
          <p className="p-3 text-xs text-gray-500">Secret until mutual: they only find out if they crush you back.</p>
          <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3">
            {cards.map(({ c, other, mutual }) => other && (
              <Link key={c.crusheeId} href={`/profile/${other.id}`} className={`rounded border p-2 text-center text-sm ${mutual ? "border-pink-400 bg-pink-50" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={other.avatarUrl ?? avatarFor(other.name)} alt={other.name} className="mx-auto h-16 w-16 rounded border" />
                <p className="mt-1 font-bold">{other.name}</p>
                <p className="text-xs">{mutual ? "mutual crush!" : "secret..."}</p>
              </Link>
            ))}
          </div>
          {cards.length === 0 && <p className="p-3 text-xs text-gray-500">No crushes yet. Visit a profile and add one.</p>}
        </div>
      </main>
    </div>
  );
}
