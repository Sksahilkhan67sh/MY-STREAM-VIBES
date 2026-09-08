'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Users, Check, X, Eye, UserPlus } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import { apiGet, apiPatch } from '@/lib/api';

interface Friend { id: string; name: string | null; username: string | null; avatarUrl: string | null; isWatching: boolean; currentStream: { roomId: string; title: string; viewerCount: number } | null; }
interface FriendReq { id: string; sender: { id: string; name: string | null; username: string | null; avatarUrl: string | null }; createdAt: string; }

export default function FriendsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const load = () => {
    if (!userId) return;
    Promise.all([
      apiGet<{ friends: Friend[] }>(`/api/friends/${userId}`),
      apiGet<{ requests: FriendReq[] }>(`/api/friends/${userId}/requests`),
    ]).then(([f, r]) => { setFriends(f.friends); setRequests(r.requests); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    await apiPatch(`/api/friends/request/${id}`, { status });
    setRequests(prev => prev.filter(r => r.id !== id));
    if (status === 'accepted') load();
  };

  if (status !== 'authenticated') return null;

  const watchingNow = friends.filter(f => f.isWatching);
  const offline = friends.filter(f => !f.isWatching);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12 max-w-3xl">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-6"><Users className="w-5 h-5" /> Friends</h1>

        {requests.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Friend Requests</h2>
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {r.sender.avatarUrl ? <img src={r.sender.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-gray-500">{(r.sender.name ?? '?').charAt(0)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{r.sender.name ?? r.sender.username}</p>
                    <p className="text-xs text-gray-400">wants to be friends</p>
                  </div>
                  <button onClick={() => respond(r.id, 'accepted')} className="p-2 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 hover:bg-green-100"><Check className="w-4 h-4" /></button>
                  <button onClick={() => respond(r.id, 'declined')} className="p-2 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-16">
            <UserPlus className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No friends yet. Visit a creator&apos;s profile or a viewer&apos;s activity to add friends.</p>
          </div>
        ) : (
          <>
            {watchingNow.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Watching Now</h2>
                <div className="space-y-2">
                  {watchingNow.map(f => (
                    <button key={f.id} onClick={() => f.currentStream && router.push(`/s/${f.currentStream.roomId}`)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors text-left">
                      <div className="relative w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {f.avatarUrl ? <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-sm font-bold text-gray-500">{(f.name ?? '?').charAt(0)}</span>}
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-950" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{f.name ?? f.username}</p>
                        <p className="text-xs text-red-500 truncate flex items-center gap-1"><Eye className="w-3 h-3" /> {f.currentStream?.title}</p>
                      </div>
                      <span className="text-xs text-gray-400">{f.currentStream?.viewerCount} watching</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {offline.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">All Friends</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {offline.map(f => (
                    <div key={f.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {f.avatarUrl ? <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold text-gray-500">{(f.name ?? '?').charAt(0)}</span>}
                      </div>
                      <p className="text-sm font-medium truncate">{f.name ?? f.username}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
