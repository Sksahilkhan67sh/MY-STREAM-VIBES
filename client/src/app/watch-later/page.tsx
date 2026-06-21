'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Bookmark, Plus, Folder, X } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import StreamCard from '@/components/discover/StreamCard';
import { apiGet, apiPost } from '@/lib/api';
import type { StreamCard as StreamCardType } from '@/lib/discover-types';

interface PlaylistLite { id: string; title: string; description?: string; _count: { items: number }; }

export default function WatchLaterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [items, setItems] = useState<StreamCardType[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      apiGet<{ items: StreamCardType[] }>(`/api/watchlater/${userId}`),
      apiGet<{ playlists: PlaylistLite[] }>(`/api/watchlater/playlists/${userId}`),
    ]).then(([w, p]) => { setItems(w.items); setPlaylists(p.playlists); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const createPlaylist = async () => {
    if (!newPlaylist.trim()) return;
    const p = await apiPost<PlaylistLite>('/api/watchlater/playlists', { userId, title: newPlaylist.trim() });
    setPlaylists(prev => [{ ...p, _count: { items: 0 } }, ...prev]);
    setNewPlaylist('');
    setShowCreate(false);
  };

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold flex items-center gap-2"><Bookmark className="w-5 h-5" /> Watch Later</h1>
        </div>

        {/* Playlists row */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Your Playlists</h2>
            <button onClick={() => setShowCreate(v => !v)} className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline">
              <Plus className="w-3.5 h-3.5" /> New playlist
            </button>
          </div>

          {showCreate && (
            <div className="flex gap-2 mb-3">
              <input value={newPlaylist} onChange={e => setNewPlaylist(e.target.value)} placeholder="Playlist name" autoFocus
                onKeyDown={e => e.key === 'Enter' && createPlaylist()}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
              <button onClick={createPlaylist} className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg">Create</button>
              <button onClick={() => setShowCreate(false)} className="p-2 text-gray-400"><X className="w-4 h-4" /></button>
            </div>
          )}

          <div className="flex gap-3 overflow-x-auto pb-2">
            {playlists.map(p => (
              <div key={p.id} className="flex-shrink-0 w-40 p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-colors">
                <Folder className="w-5 h-5 text-gray-400 mb-2" />
                <p className="text-sm font-semibold truncate">{p.title}</p>
                <p className="text-xs text-gray-400">{p._count.items} streams</p>
              </div>
            ))}
            {playlists.length === 0 && !showCreate && (
              <p className="text-sm text-gray-400 py-2">No playlists yet — group your saved streams into collections.</p>
            )}
          </div>
        </div>

        {/* Saved streams */}
        <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Saved Streams</h2>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Bookmark className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">Nothing saved yet. Tap the bookmark icon on any stream to save it here.</p>
            <button onClick={() => router.push('/feed')} className="text-red-500 text-sm font-semibold hover:underline">Browse streams →</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {items.map(s => <StreamCard key={s.id} stream={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
