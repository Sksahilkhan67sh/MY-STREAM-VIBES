'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { History as HistoryIcon } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import { apiGet } from '@/lib/api';

interface HistoryItem {
  id: string;
  watchSeconds: number;
  lastWatchedAt: string;
  stream: {
    roomId: string; title: string; thumbnailUrl: string | null; isLive: boolean; viewerCount: number;
    category: { name: string; slug: string; icon: string } | null;
    user: { id: string; name: string | null; username: string | null; avatarUrl: string | null } | null;
  };
}

function formatWatchTime(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return 'just started';
  if (mins < 60) return `${mins} min watched`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m watched`;
}

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/history');
  }, [status, router]);

  useEffect(() => {
    if (!userId) return;
    apiGet<{ history: HistoryItem[] }>(`/api/history/${encodeURIComponent(userId)}`)
      .then(d => setHistory(d.history))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (status !== 'authenticated') return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12 max-w-3xl mx-auto">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-6"><HistoryIcon className="w-5 h-5" /> Watch History</h1>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-16">
            <HistoryIcon className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">No watch history yet.</p>
            <button onClick={() => router.push('/feed')} className="text-red-500 text-sm font-semibold hover:underline">Find something to watch →</button>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(h => (
              <button
                key={h.id}
                onClick={() => router.push(`/s/${h.stream.roomId}`)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-colors text-left"
              >
                <div className="w-24 h-14 rounded-lg bg-gray-100 dark:bg-gray-900 flex-shrink-0 overflow-hidden relative">
                  {h.stream.thumbnailUrl ? (
                    <img src={h.stream.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-700 text-xs">No thumbnail</div>
                  )}
                  {h.stream.isLive && (
                    <span className="absolute top-1 left-1 text-[9px] font-bold text-white bg-red-600 px-1 py-0.5 rounded">LIVE</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{h.stream.title}</p>
                  <p className="text-xs text-gray-400 truncate">{h.stream.user?.name || h.stream.user?.username || 'Unknown creator'}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {formatWatchTime(h.watchSeconds)} · {new Date(h.lastWatchedAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
