'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Users, Bell, BellOff, Radio } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import { apiGet, apiPost, apiDelete } from '@/lib/api';

interface FollowedCreator {
  creatorId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  notifyOnLive: boolean;
  isLive: boolean;
  liveStream: { roomId: string; title: string; viewerCount: number; thumbnailUrl: string | null } | null;
  lastStream: { title: string; createdAt: string; thumbnailUrl: string | null } | null;
}

export default function FollowingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [following, setFollowing] = useState<FollowedCreator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/following');
  }, [status, router]);

  useEffect(() => {
    if (!userId) return;
    apiGet<{ following: FollowedCreator[] }>(`/api/creators/following/${encodeURIComponent(userId)}`)
      .then(d => setFollowing(d.following))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const toggleNotify = async (creatorId: string, current: boolean) => {
    setFollowing(prev => prev.map(f => f.creatorId === creatorId ? { ...f, notifyOnLive: !current } : f));
    try {
      await apiPost('/api/creators/follow', { followerId: userId, creatorId, notifyOnLive: !current });
    } catch {
      setFollowing(prev => prev.map(f => f.creatorId === creatorId ? { ...f, notifyOnLive: current } : f));
    }
  };

  const unfollow = async (creatorId: string) => {
    setFollowing(prev => prev.filter(f => f.creatorId !== creatorId));
    try {
      await apiDelete('/api/creators/follow', { followerId: userId, creatorId });
    } catch {
      // best-effort — if it fails, a page refresh will show the true state again
    }
  };

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12 max-w-3xl mx-auto">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-6"><Users className="w-5 h-5" /> Following</h1>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : following.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">You're not following anyone yet.</p>
            <button onClick={() => router.push('/feed')} className="text-red-500 text-sm font-semibold hover:underline">Discover creators →</button>
          </div>
        ) : (
          <div className="space-y-2">
            {following.map(f => (
              <div key={f.creatorId} className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                <button
                  onClick={() => router.push(`/creator/${f.username || f.creatorId}`)}
                  className="relative flex-shrink-0"
                >
                  {f.avatarUrl ? (
                    <img src={f.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-sm font-bold text-gray-500">{(f.name || f.username || '?')[0].toUpperCase()}</span>
                    </div>
                  )}
                  {f.isLive && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white dark:border-gray-950" />
                  )}
                </button>

                <button onClick={() => router.push(`/creator/${f.username || f.creatorId}`)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate">{f.name || f.username || 'Creator'}</p>
                  {f.isLive && f.liveStream ? (
                    <p className="text-xs text-red-500 font-medium truncate flex items-center gap-1">
                      <Radio className="w-3 h-3" /> Live now · {f.liveStream.title}
                    </p>
                  ) : f.lastStream ? (
                    <p className="text-xs text-gray-400 truncate">
                      Last streamed {new Date(f.lastStream.createdAt).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">No streams yet</p>
                  )}
                </button>

                {f.isLive && f.liveStream && (
                  <button
                    onClick={() => router.push(`/s/${f.liveStream!.roomId}`)}
                    className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition-colors flex-shrink-0"
                  >
                    Watch
                  </button>
                )}

                <button
                  onClick={() => toggleNotify(f.creatorId, f.notifyOnLive)}
                  title={f.notifyOnLive ? 'Notifications on — click to turn off' : 'Notifications off — click to turn on'}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors flex-shrink-0"
                >
                  {f.notifyOnLive ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => unfollow(f.creatorId)}
                  className="text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  Unfollow
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
