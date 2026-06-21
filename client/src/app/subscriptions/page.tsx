'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Crown, Radio, X } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import { apiGet, apiDelete } from '@/lib/api';

interface SubscriptionItem {
  id: string;
  status: string;
  startedAt: string;
  expiresAt: string | null;
  renewsAt: string | null;
  tier: { id: string; name: string; price: number; currency: string; color: string; perks: string[] };
  creator: { id: string; name: string | null; username: string | null; avatarUrl: string | null; isLive: boolean; liveRoomId: string | null } | null;
}

export default function SubscriptionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [subs, setSubs] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/subscriptions');
  }, [status, router]);

  useEffect(() => {
    if (!userId) return;
    apiGet<{ memberships: SubscriptionItem[] }>(`/api/memberships/user/${encodeURIComponent(userId)}`)
      .then(d => setSubs(d.memberships))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const cancelSubscription = async (tierId: string, membershipId: string) => {
    if (!confirm('Cancel this membership? You will lose access to its perks.')) return;
    setCancelling(membershipId);
    try {
      await apiDelete('/api/memberships/cancel', { userId, tierId });
      setSubs(prev => prev.filter(s => s.id !== membershipId));
    } catch {
      alert('Could not cancel right now. Please try again.');
    } finally {
      setCancelling(null);
    }
  };

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12 max-w-3xl mx-auto">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-6"><Crown className="w-5 h-5" /> Subscriptions</h1>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : subs.length === 0 ? (
          <div className="text-center py-16">
            <Crown className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">No active memberships yet.</p>
            <button onClick={() => router.push('/feed')} className="text-red-500 text-sm font-semibold hover:underline">Discover creators →</button>
          </div>
        ) : (
          <div className="space-y-3">
            {subs.map(s => (
              <div key={s.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => s.creator && router.push(`/creator/${s.creator.username || s.creator.id}`)}
                    className="relative flex-shrink-0"
                  >
                    {s.creator?.avatarUrl ? (
                      <img src={s.creator.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-500">{(s.creator?.name || s.creator?.username || '?')[0].toUpperCase()}</span>
                      </div>
                    )}
                    {s.creator?.isLive && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white dark:border-gray-950" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.creator?.name || s.creator?.username || 'Creator'}</p>
                    <span
                      className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full mt-0.5"
                      style={{ backgroundColor: `${s.tier.color}20`, color: s.tier.color }}
                    >
                      {s.tier.name}
                    </span>
                  </div>
                  {s.creator?.isLive && s.creator.liveRoomId && (
                    <button
                      onClick={() => router.push(`/s/${s.creator!.liveRoomId}`)}
                      className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition-colors flex-shrink-0 flex items-center gap-1"
                    >
                      <Radio className="w-3 h-3" /> Watch
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-gray-50 dark:border-gray-900">
                  <span>{(s.tier.price / 100).toFixed(2)} {s.tier.currency} / month</span>
                  {s.renewsAt && <span>Renews {new Date(s.renewsAt).toLocaleDateString()}</span>}
                  {!s.renewsAt && s.expiresAt && <span>Expires {new Date(s.expiresAt).toLocaleDateString()}</span>}
                </div>

                {s.tier.perks?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {s.tier.perks.slice(0, 3).map((p, i) => (
                      <span key={i} className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded-full">{p}</span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 mt-3">
                  <button
                    onClick={() => s.creator && router.push(`/creator/${s.creator.username || s.creator.id}`)}
                    className="text-xs font-semibold text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Visit creator →
                  </button>
                  <button
                    onClick={() => cancelSubscription(s.tier.id, s.id)}
                    disabled={cancelling === s.id}
                    className="text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <X className="w-3 h-3" /> {cancelling === s.id ? 'Cancelling...' : 'Cancel membership'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
