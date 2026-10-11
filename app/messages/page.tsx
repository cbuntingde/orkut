import Link from "next/link";
import { eq } from "drizzle-orm";
import Header from "@/components/Header";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getConversations } from "@/lib/social-actions";
import { users } from "@/drizzle/schema";
import { avatarFor } from "@/lib/orkut";

export default async function MessagesPage() {
  const me = await requireUser();
  const convos = await getConversations();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box"><div className="orkut-box-header">messages ({convos.length})</div>
          <div className="divide-y text-sm">
            {await Promise.all(convos.map(async ([otherId, last]) => {
              const other = (await db.select().from(users).where(eq(users.id, otherId)).limit(1))[0];
              if (!other) return null;
              const unread = last.receiverId === me.id && !last.readAt;
              return (
                <Link key={otherId} href={`/messages/${otherId}`} className="flex items-center gap-2 p-3 hover:bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={other.avatarUrl ?? avatarFor(other.name)} alt={other.name} className="h-10 w-10 rounded border" />
                  <span className="flex-1">
                    <span className={`orkut-link font-bold ${unread ? "underline" : ""}`}>{other.name}{unread ? " (new)" : ""}</span>
                    <span className="block text-xs text-gray-500">{last.body.slice(0, 80)}</span>
                  </span>
                </Link>
              );
            }))}
            {convos.length === 0 && <p className="p-3 text-xs text-gray-500">No messages yet — visit a profile to say hi.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
