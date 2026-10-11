import Link from "next/link";
import { getSessionUser, destroySession } from "@/lib/auth";
import { unreadCount } from "@/lib/notify";

export default async function Header() {
  const user = await getSessionUser();
  const unread = user ? await unreadCount(user.id).catch(() => 0) : 0;
  return (
    <header className="w-full" style={{ background: "var(--orkut-blue)", borderBottom: "1px solid var(--orkut-blue-dark)" }}>
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2">
        <Link href={user ? "/home" : "/"} className="text-2xl font-black tracking-tight" style={{ color: "var(--orkut-pink)" }}>
          orkut
        </Link>
        {user ? (
          <nav className="flex flex-1 items-center gap-3 text-sm">
            <Link className="orkut-link" href="/home">Home</Link>
            <Link className="orkut-link" href={`/profile/${user.id}`}>Profile</Link>
            <Link className="orkut-link" href="/friends">Friends</Link>
            <Link className="orkut-link" href="/fans">Fans</Link>
            <Link className="orkut-link" href="/crushes">Crushes</Link>
            <Link className="orkut-link" href="/communities">Communities</Link>
            <Link className="orkut-link" href="/search">Search</Link>
            <Link className="orkut-link" href="/messages">Messages</Link>
            <Link className="orkut-link" href="/notifications">
              Alerts{unread > 0 ? ` (${unread})` : ""}
            </Link>
            {/* Site moderation, which is an administrator-only queue. The link is
                hidden for everyone else, but the route and the actions behind it
                are gated too — this is presentation, not the control. */}
            {user.isAdmin && <Link className="orkut-link" href="/moderation">Safety</Link>}
            <form action={async () => { "use server"; await destroySession(); }} className="ml-auto">
              <Link className="orkut-link mr-2 text-xs" href="/settings">settings</Link>
              <span className="mr-2 text-xs" style={{ color: "var(--orkut-ink)" }}>{user.name}</span>
              <button className="rounded bg-white px-2 py-1 text-xs font-bold text-gray-700 shadow-sm" type="submit">logout</button>
            </form>
          </nav>
        ) : (
          <nav className="ml-auto flex items-center gap-3 text-sm">
            <Link className="orkut-link font-bold" href="/login">login</Link>
            <Link className="rounded px-2 py-1 text-sm font-bold text-white" style={{ background: "var(--orkut-pink)" }} href="/signup">join orkut</Link>
          </nav>
        )}
      </div>
    </header>
  );
}