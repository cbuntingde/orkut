import Header from "@/components/Header";
import { requireUser } from "@/lib/auth";
import { getOpenReports, moderateReport } from "@/lib/safety-actions";

export default async function ModerationPage() {
  await requireUser();
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
                <div className="flex gap-2 text-xs">
                  <form action={moderateReport.bind(null, r.id, "actioned")}><button className="font-bold text-green-700">action</button></form>
                  <form action={moderateReport.bind(null, r.id, "dismissed")}><button className="font-bold text-gray-500">dismiss</button></form>
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
