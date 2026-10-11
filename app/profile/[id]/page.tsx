import Link from "next/link";
import Header from "@/components/Header";
import ProfileView from "@/components/ProfileView";
import { getSessionUser } from "@/lib/auth";
import { getProfileData } from "@/lib/profile-data";
import { logVisit } from "@/lib/community-actions";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  // logged-out visitors: read-only, no visit log, no action buttons
  if (me && me.id !== id) await logVisit(id).catch(() => undefined);
  const data = await getProfileData(id, me?.id);
  if (!data) return <div className="p-8">User not found. <Link className="orkut-link" href="/">home</Link></div>;
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      {!me && (
        <p className="mx-auto w-full max-w-5xl px-4 pt-2 text-xs text-gray-600">
          Viewing as guest — <Link href="/login" className="orkut-link font-bold">login</Link> or <Link href="/signup" className="orkut-link font-bold">join orkut</Link> to scrap, fan, crush, and rate.
        </p>
      )}
      <ProfileView data={data} id={id} isMine={me?.id === id} loggedIn={!!me} />
    </div>
  );
}
