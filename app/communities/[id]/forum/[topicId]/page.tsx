import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import Header from "@/components/Header";
import { ReplyForm } from "@/components/ForumForms";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { posts, topics, users } from "@/drizzle/schema";

export default async function TopicPage({ params }: { params: Promise<{ id: string; topicId: string }> }) {
  const { id, topicId } = await params;
  const me = await getSessionUser();
  const t = (await db.select().from(topics).where(eq(topics.id, topicId)).limit(1))[0];
  if (!t) return <div className="p-8">Topic not found.</div>;
  const replies = await db.select().from(posts).where(eq(posts.topicId, topicId)).orderBy(asc(posts.createdAt));
  const withAuthors = await Promise.all(replies.map(async (p) => ({
    p,
    author: p.authorId ? (await db.select().from(users).where(eq(users.id, p.authorId)).limit(1))[0] : undefined,
  })));
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <Link href={`/communities/${id}`} className="orkut-link text-xs">← back to community</Link>
        <div className="orkut-box"><div className="orkut-box-header">{t.title}</div>
          <div className="divide-y text-sm">
            {withAuthors.map(({ p, author }) => (
              <div key={p.id} className="p-3">
                <p>{p.body}</p>
                <p className="text-xs text-gray-500">by {author ? author.name : "deleted"} · {new Date(p.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
          {me && <ReplyForm communityId={id} topicId={topicId} />}
        </div>
      </main>
    </div>
  );
}
