'use client';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Settings as SettingsIcon, Bell, Lock, LogOut, Check } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import { apiGet, apiPatch } from '@/lib/api';

interface UserSettings {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  profilePrivate: boolean;
  emailNotifsEnabled: boolean;
  pushNotifsEnabled: boolean;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/settings');
  }, [status, router]);

  useEffect(() => {
    if (!userId) return;
    apiGet<UserSettings>(`/api/users/${encodeURIComponent(userId)}/settings`)
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const update = async (patch: Partial<Pick<UserSettings, 'profilePrivate' | 'emailNotifsEnabled' | 'pushNotifsEnabled'>>) => {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, ...patch } : prev);
    try {
      await apiPatch(`/api/users/${encodeURIComponent(userId)}/settings`, patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // revert on failure
      apiGet<UserSettings>(`/api/users/${encodeURIComponent(userId)}/settings`).then(setSettings).catch(() => {});
    }
  };

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2"><SettingsIcon className="w-5 h-5" /> Settings</h1>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-500">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>

        {loading || !settings ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Account */}
            <section>
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Account</h2>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                {settings.avatarUrl ? (
                  <img src={settings.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-500">{(settings.name || settings.email)[0].toUpperCase()}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{settings.name || 'No name set'}</p>
                  <p className="text-xs text-gray-400 truncate">{settings.email}</p>
                </div>
              </div>
            </section>

            {/* Notifications */}
            <section>
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" /> Notifications
              </h2>
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                <div className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold">In-app notifications</p>
                    <p className="text-xs text-gray-400 mt-0.5">Get notified in StreamVault when creators you follow go live.</p>
                  </div>
                  <Toggle checked={settings.pushNotifsEnabled} onChange={v => update({ pushNotifsEnabled: v })} />
                </div>
                <div className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold">Email notifications</p>
                    <p className="text-xs text-gray-400 mt-0.5">Receive email updates about your account and subscriptions.</p>
                  </div>
                  <Toggle checked={settings.emailNotifsEnabled} onChange={v => update({ emailNotifsEnabled: v })} />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                You can still set one-off reminders for specific scheduled streams regardless of this setting.
              </p>
            </section>

            {/* Privacy */}
            <section>
              <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Privacy
              </h2>
              <div className="rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold">Private profile</p>
                    <p className="text-xs text-gray-400 mt-0.5">Hide your watch history and who you follow from other people.</p>
                  </div>
                  <Toggle checked={settings.profilePrivate} onChange={v => update({ profilePrivate: v })} />
                </div>
              </div>
            </section>

            {/* Sign out */}
            <section>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="flex items-center gap-2 text-sm font-semibold text-red-500 hover:underline"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
