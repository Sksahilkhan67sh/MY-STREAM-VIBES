'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import SiteHeader from '@/components/discover/SiteHeader';
import CategoryPills from '@/components/discover/CategoryPills';
import StreamRow from '@/components/discover/StreamRow';
import CreatorCard from '@/components/discover/CreatorCard';
import { apiGet } from '@/lib/api';
import type { CategoryLite, StreamCard as StreamCardType, CreatorSearchResult } from '@/lib/discover-types';

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [mostViewed, setMostViewed] = useState<StreamCardType[]>([]);
  const [fastestGrowing, setFastestGrowing] = useState<StreamCardType[]>([]);
  const [liveNow, setLiveNow] = useState<StreamCardType[]>([]);
  const [recommended, setRecommended] = useState<StreamCardType[]>([]);
  const [topCreators, setTopCreators] = useState<CreatorSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cats, trending, live, rec] = await Promise.all([
          apiGet<{ categories: CategoryLite[] }>('/api/discover/categories'),
          apiGet<{ mostViewed: StreamCardType[]; fastestGrowing: StreamCardType[] }>('/api/discover/trending'),
          apiGet<{ streams: StreamCardType[] }>('/api/discover/live?limit=18'),
          apiGet<{ streams: StreamCardType[] }>(`/api/discover/recommended${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
        ]);
        if (cancelled) return;
        setCategories(cats.categories);
        setMostViewed(trending.mostViewed);
        setFastestGrowing(trending.fastestGrowing);
        setLiveNow(live.streams);
        setRecommended(rec.streams);

        // Top creators — derive from search with empty-ish broad query isn't supported,
        // so pull from the most-viewed live streams' creators as a reasonable proxy.
        const seen = new Set<string>();
        const creators: CreatorSearchResult[] = [];
        for (const s of [...trending.mostViewed, ...live.streams]) {
          if (s.user && !seen.has(s.user.id)) {
            seen.add(s.user.id);
            creators.push({
              id: s.user.id, name: s.user.name, username: s.user.username,
              avatarUrl: s.user.avatarUrl, bio: null, followerCount: 0, streamCount: 0,
            });
          }
          if (creators.length >= 8) break;
        }
        setTopCreators(creators);
      } catch {
        // discovery API may be unreachable (server down / not yet deployed) — show empty states
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      <SiteHeader />

      {/* Categories */}
      <div className="pt-5 pb-1">
        <CategoryPills categories={categories} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
        </div>
      ) : (
        <div className="pt-6">
          {/* Trending */}
          <StreamRow title="Trending Streams" icon="🔥" streams={mostViewed} emptyText="No trending streams right now." />
          {fastestGrowing.length > 0 && (
            <StreamRow title="Fastest Growing" icon="📈" streams={fastestGrowing} />
          )}

          {/* Live Now */}
          <StreamRow title="Live Now" icon="🔴" streams={liveNow} emptyText="No one is live right now — check back soon." />

          {/* Recommended */}
          <StreamRow
            title="Recommended For You"
            icon="⭐"
            streams={recommended}
            emptyText="Follow creators and watch a few streams to get personalized picks."
          />

          {/* Top Creators */}
          {topCreators.length > 0 && (
            <section className="mb-10">
              <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold mb-4 px-4 sm:px-8">
                <span>🎥</span> Top Creators
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 px-4 sm:px-8">
                {topCreators.map(c => <CreatorCard key={c.id} creator={c} />)}
              </div>
            </section>
          )}

          {mostViewed.length === 0 && liveNow.length === 0 && (
            <div className="text-center py-16 px-4">
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">No public streams yet — be the first to go live.</p>
              <button
                onClick={() => router.push('/host')}
                className="px-6 py-3 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors"
              >
                Start streaming →
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="border-t border-gray-100 dark:border-gray-800 py-6 px-4 sm:px-8 mt-6">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 justify-between text-xs text-gray-400 dark:text-gray-600">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="StreamVault" className="w-5 h-5 object-contain" />
            <span>StreamVault</span>
          </div>
          <button onClick={() => router.push('/landing')} className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            About StreamVault
          </button>
        </div>
      </footer>
    </div>
  );
}
