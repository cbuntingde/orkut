import Link from "next/link";
import { eq } from "drizzle-orm";
import Header from "@/components/Header";
import DMForm from "@/components/DMForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getThread } from "@/lib/social-actions";
import { users } from "@/drizzle/schema";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const other = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!other) return <div className="p-8">User not found.</div>;
  const thread = await getThread(id);
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Link href="/messages" className="orkut-link text-xs">← all messages</Link>
        <div className="orkut-box"><div className="orkut-box-header">chat with {other.name}</div>
          <div className="max-h-96 space-y-2 overflow-y-auto p-3 text-sm">
            {thread.map((m) => (
              <div key={m.id} className={`max-w-[80%] rounded p-2 ${m.senderId === me.id ? "ml-auto bg-[#e5ecf9]" : "bg-gray-100"}`}>
                <p>{m.body}</p>
                <p className="text-[10px] text-gray-500">{new Date(m.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {thread.length === 0 && <p className="text-xs text-gray-500">Say hi!</p>}
          </div>
          <DMForm otherId={id} />
        </div>
      </main>
    </div>
  );
}
