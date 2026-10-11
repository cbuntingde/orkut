import Header from "@/components/Header";
import { PasswordForm, DangerZone } from "@/components/SettingsForms";
import ThemePicker from "@/components/ThemePicker";
import TwoFactorPanel from "@/components/TwoFactorPanel";
import SessionList from "@/components/SessionList";
import { requireUser } from "@/lib/auth";
import { listSessions, relativeTime } from "@/lib/session";
import { twoFactorState, recoveryCodesRemaining } from "@/lib/totp-actions";

export default async function SettingsPage() {
  const me = await requireUser();
  const [sessionRows, totp, recoveryLeft] = await Promise.all([
    listSessions(me.id),
    twoFactorState(me.id),
    recoveryCodesRemaining(me.id),
  ]);
  const sessions = sessionRows.map((s) => ({
    id: s.id,
    device: s.device,
    ip: s.ip,
    lastSeen: relativeTime(s.lastSeenAt),
    current: s.current,
  }));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 p-4">
        <div className="orkut-box"><div className="orkut-box-header">appearance</div><ThemePicker current={me.theme} /></div>
        <div className="orkut-box"><div className="orkut-box-header">two-factor authentication</div><TwoFactorPanel state={totp} recoveryLeft={recoveryLeft} /></div>
        <div className="orkut-box"><div className="orkut-box-header">signed-in devices</div><SessionList sessions={sessions} /></div>
        <div className="orkut-box"><div className="orkut-box-header">change password</div><PasswordForm /></div>
        <div className="orkut-box"><div className="orkut-box-header">sessions &amp; account</div><DangerZone /></div>
      </main>
    </div>
  );
}