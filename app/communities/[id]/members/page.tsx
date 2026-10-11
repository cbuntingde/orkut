import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import Header from "@/components/Header";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole, removeMember, setMemberRole, updateCommunitySettings } from "@/lib/community-actions";
import { avatarFor } from "@/lib/orkut";
import CommunityAdminForms from "@/components/CommunityAdminForms";
import { communities, communityMembers, users } from "@/drizzle/schema";

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  const c = (await db.select().from(communities).where(eq(communities.id, id)).limit(1))[0];
  if (!c) return <div className="p-8">Community not found.</div>;

  const { isModerator, role: myRole } = me ? await requireRole(id).catch(() => ({ isModerator: false, role: null })) : { isModerator: false, role: null };

  const members = await db
    .select({ member: communityMembers, user: users })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(eq(communityMembers.communityId, id))
    .orderBy(asc(communityMembers.joinedAt));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box p-4">
          <h1 className="text-lg font-black" style={{ color: "#ed2590" }}>{c.name} members</h1>
          <p className="text-xs text-gray-500">{c.membersCount} members · join policy: {c.joinPolicy}</p>
          <Link href={`/communities/${id}`} className="orkut-link text-xs">← back to community</Link>
        </div>

        {isModerator && (
          <div className="orkut-box">
            <div className="orkut-box-header">moderator tools</div>
            <CommunityAdminForms communityId={id} rules={c.rules ?? ""} joinPolicy={c.joinPolicy} />
          </div>
        )}

        <div className="orkut-box">
          <div className="orkut-box-header">members ({members.length})</div>
          <div className="divide-y text-sm">
            {members.map(({ member, user }) => (
              <div key={user.id} className="flex items-center gap-2 p-3">
                <Link href={`/profile/${user.id}`} className="flex flex-1 items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={user.avatarUrl ?? avatarFor(user.name)} alt={user.name} className="h-9 w-9 rounded border" />
                  <span>{user.name}</span>
                </Link>
                <span className="text-[10px] font-bold uppercase text-gray-500">
                  {member.role === "owner" ? "★ owner" : member.role === "moderator" ? "★ moderator" : ""}
                </span>
                {isModerator && member.role !== "owner" && user.id !== me?.id && (
                  <span className="flex items-center gap-2">
                    {myRole === "owner" && (
                      <form action={setMemberRole.bind(null, id, user.id, member.role === "moderator" ? "member" : "moderator")}>
                        <button className="text-xs font-bold text-blue-700">
                          {member.role === "moderator" ? "demote" : "make mod"}
                        </button>
                      </form>
                    )}
                    <form action={removeMember.bind(null, id, user.id)}>
                      <button className="text-xs font-bold text-red-600">remove</button>
                    </form>
                  </span>
                )}
              </div>
            ))}
            {members.length === 0 && <p className="p-3 text-xs text-gray-500">No members yet.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}