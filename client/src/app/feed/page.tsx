'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import SiteHeader from '@/components/discover/SiteHeader';
import ViewerFooter from '@/components/brand/ViewerFooter';
import CategoryPills from '@/components/discover/CategoryPills';
import StreamRow from '@/components/discover/StreamRow';
import CreatorCard from '@/components/discover/CreatorCard';
import { apiGet } from '@/lib/api';
import type { CategoryLite, StreamCard as StreamCardType, CreatorSearchResult } from '@/lib/discover-types';
import { useUserRole } from '@/hooks/useUserRole';

export default function FeedPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';
  const { hasSelectedRole, isCreator, loading: roleLoading } = useUserRole();

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [mostViewed, setMostViewed] = useState<StreamCardType[]>([]);
  const [fastestGrowing, setFastestGrowing] = useState<StreamCardType[]>([]);
  const [liveNow, setLiveNow] = useState<StreamCardType[]>([]);
  const [recommended, setRecommended] = useState<StreamCardType[]>([]);
  const [fromFollowed, setFromFollowed] = useState<StreamCardType[]>([]);
  const [becauseYouLiked, setBecauseYouLiked] = useState<StreamCardType[]>([]);
  const [recommendedReplays, setRecommendedReplays] = useState<StreamCardType[]>([]);
  const [usedFallback, setUsedFallback] = useState(false);
  const [topCreators, setTopCreators] = useState<CreatorSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Onboarding guard ──
  // Only ever redirects a signed-in user who has never chosen Viewer/Creator.
  // Logged-out visitors and anyone who has already chosen keep browsing the
  // feed exactly as before — this never blocks public/anonymous viewing.
  useEffect(() => {
    if (status === 'authenticated' && !roleLoading && !hasSelectedRole) {
      router.replace('/onboarding');
    }
  }, [status, roleLoading, hasSelectedRole, router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cats, trending, live] = await Promise.all([
          apiGet<{ categories: CategoryLite[] }>('/api/discover/categories'),
          apiGet<{ mostViewed: StreamCardType[]; fastestGrowing: StreamCardType[] }>('/api/discover/trending'),
          apiGet<{ streams: StreamCardType[] }>('/api/discover/live?limit=18'),
        ]);
        if (cancelled) return;
        setCategories(cats.categories);
        setMostViewed(trending.mostViewed);
        setFastestGrowing(trending.fastestGrowing);
        setLiveNow(live.streams);

        // AI-powered recommendations for signed-in viewers; generic fallback otherwise
        let usedRealRecommendedCreators = false;
        if (userId) {
          try {
            const ai = await apiGet<{
              forYou: StreamCardType[]; fromFollowed: StreamCardType[]; becauseYouLiked: StreamCardType[];
              recommendedCreators?: CreatorSearchResult[]; recommendedReplays?: StreamCardType[]; usedFallback?: boolean;
            }>(`/api/ai-features/recommendations/${encodeURIComponent(userId)}`);
            if (!cancelled) {
              setRecommended(ai.forYou);
              setFromFollowed(ai.fromFollowed);
              setBecauseYouLiked(ai.becauseYouLiked);
              setRecommendedReplays(ai.recommendedReplays || []);
              setUsedFallback(!!ai.usedFallback);
              if (ai.recommendedCreators && ai.recommendedCreators.length > 0) {
                setTopCreators(ai.recommendedCreators);
                usedRealRecommendedCreators = true;
              }
            }
          } catch {
            const rec = await apiGet<{ streams: StreamCardType[] }>(`/api/discover/recommended?userId=${encodeURIComponent(userId)}`);
            if (!cancelled) setRecommended(rec.streams);
          }
        } else {
          const rec = await apiGet<{ streams: StreamCardType[] }>('/api/discover/recommended');
          if (!cancelled) setRecommended(rec.streams);
        }

        // Top creators fallback — only used when there's no real
        // recommendedCreators signal (logged-out visitor, or a signed-in
        // user whose recommendation call failed/returned none). Derives a
        // reasonable proxy from the most-viewed live streams' creators.
        if (!usedRealRecommendedCreators) {
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
          if (!cancelled) setTopCreators(creators);
        }
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

          {/* Recommended — honest labeling: if there's no real personalization
              signal yet (brand-new account), this is trending content, not
              a personalized pick, so it's labeled accordingly rather than
              implying personalization that didn't happen. */}
          <StreamRow
            title={usedFallback ? 'Trending Now' : 'Recommended For You'}
            icon={usedFallback ? '🔥' : '⭐'}
            streams={recommended}
            emptyText="Follow creators and watch a few streams to get personalized picks."
          />

          {fromFollowed.length > 0 && (
            <StreamRow title="From Creators You Follow" icon="👤" streams={fromFollowed} />
          )}
          {becauseYouLiked.length > 0 && (
            <StreamRow title="Because You Liked Similar Streams" icon="💜" streams={becauseYouLiked} />
          )}
          {recommendedReplays.length > 0 && (
            <StreamRow title="Replays You Might Like" icon="📼" streams={recommendedReplays} />
          )}

          {/* Top Creators */}
          {topCreators.length > 0 && (
            <section className="mb-10">
              <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold mb-4 px-4 sm:px-8">
                <span>🎥</span> {usedFallback ? 'Popular Creators' : 'Recommended Creators'}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 px-4 sm:px-8">
                {topCreators.map(c => <CreatorCard key={c.id} creator={c} />)}
              </div>
            </section>
          )}

          {mostViewed.length === 0 && liveNow.length === 0 && (
            <div className="text-center py-16 px-4">
              {isCreator ? (
                <>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">No public streams yet — be the first to go live.</p>
                  <button
                    onClick={() => router.push('/studio')}
                    className="px-6 py-3 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors"
                  >
                    Start streaming →
                  </button>
                </>
              ) : (
                <p className="text-gray-400 dark:text-gray-500 text-sm">No live streams right now — check back soon.</p>
              )}
            </div>
          )}
        </div>
      )}

      <ViewerFooter />
    </div>
  );
}
