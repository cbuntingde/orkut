import Link from "next/link";
import { eq } from "drizzle-orm";
import Header from "@/components/Header";
import { AddVideoForm, VideoList } from "@/components/VideoForms";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getVideos } from "@/lib/video-actions";
import { users } from "@/drizzle/schema";

export default async function VideosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u) return <div className="p-8">User not found.</div>;
  const videos = await getVideos(id);
  const isMine = me?.id === id;
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <Link href={`/profile/${id}`} className="orkut-link text-xs">← back to {u.name.split(" ")[0]}&apos;s profile</Link>
        <div className="orkut-box">
          <div className="orkut-box-header">videos ({videos.length})</div>
          {isMine && <AddVideoForm />}
          <VideoList videos={videos} canDelete={isMine} />
        </div>
      </main>
    </div>
  );
}