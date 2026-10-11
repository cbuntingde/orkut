import Header from "@/components/Header";
import { requireAdmin } from "@/lib/auth";
import { getOpenReports, moderateReport, setJail } from "@/lib/safety-actions";

export default async function ModerationPage() {
  await requireAdmin();
  const open = await getOpenReports();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        <div className="orkut-box"><div className="orkut-box-header">moderation queue ({open.length} open)</div>
          <p className="p-3 text-xs text-gray-500">What Google Brazil never had enough of. Review reports, action or dismiss.</p>
          <div className="divide-y text-sm">
            {open.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2 p-3">
                <div>
                  <p><b>{r.targetType}</b> <span className="text-xs text-gray-500">{r.targetId.slice(0, 8)}…</span></p>
                  <p className="text-xs italic">{r.reason}</p>
                  <p className="text-[11px] text-gray-400">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2 text-xs">
                  <form action={moderateReport.bind(null, r.id, "actioned")}><button className="font-bold text-green-700">action</button></form>
                  <form action={moderateReport.bind(null, r.id, "dismissed")}><button className="font-bold text-gray-500">dismiss</button></form>
                  {/* Only a profile report carries a user id, which is the only
                      thing a jail can be applied to. Days of 1 matches the
                      bottom rung of the ladder in lib/jail.ts, so this is an
                      override for a single report rather than a shortcut past
                      the thresholds. */}
                  {r.targetType === "profile" && (
                    <>
                      <form action={setJail.bind(null, r.targetId, 1)}>
                        <button className="font-bold text-orange-700">jail 1 day</button>
                      </form>
                      <form action={setJail.bind(null, r.targetId, 0)}>
                        <button className="font-bold text-gray-500">unjail</button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            ))}
            {open.length === 0 && <p className="p-3 text-xs text-gray-500">Queue clear. Orkut would be proud.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
