import Link from "next/link";
import Header from "@/components/Header";
import MarkNotificationsRead from "@/components/MarkNotificationsRead";
import ScrapText from "@/components/ScrapText";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notify";

const LABELS: Record<string, string> = {
  friend_request: "wants to be your friend",
  friend_accept: "accepted your friend request",
  scrap: "left you a scrap",
  testimonial: "wrote you a testimonial",
  report: "your content was reported",
};

export default async function NotificationsPage() {
  const me = await requireUser();
  const rows = await getNotifications(me.id, 50);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <div className="orkut-box">
          <div className="orkut-box-header">notifications ({rows.length})</div>
          <div className="divide-y text-sm">
            {rows.map(({ notification, actor }) => (
              <div key={notification.id} className="flex items-start gap-2 p-3" style={{ background: notification.readAt ? undefined : "#fffdf5" }}>
                <span className="mt-0.5 text-xs">{notification.readAt ? "" : "●"}</span>
                <div className="flex-1">
                  <p>
                    {actor ? (
                      <Link href={`/profile/${actor.id}`} className="orkut-link font-bold">{actor.name}</Link>
                    ) : (
                      <span className="font-bold">orkut</span>
                    )}{" "}
                    {LABELS[notification.kind] ?? notification.kind}
                  </p>
                  {/* The excerpt goes through the same scrap renderer as the
                      scrapbook, so a coloured or bold fragment reads the way it
                      will on the profile instead of showing its own markup. */}
                  {notification.body && (
                    <p className="text-xs text-gray-600 italic">
                      &quot;<ScrapText body={notification.body} />&quot;
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400">{new Date(notification.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="p-3 text-xs text-gray-500">Nothing yet. Go scrape someone.</p>}
          </div>
          <div className="border-t p-2">
            <MarkNotificationsRead />
          </div>
        </div>
      </main>
    </div>
  );
}