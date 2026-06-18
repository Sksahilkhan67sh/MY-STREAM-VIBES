'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteHeader from '@/components/discover/SiteHeader';
import StreamCard from '@/components/discover/StreamCard';
import CreatorCard from '@/components/discover/CreatorCard';
import { apiGet } from '@/lib/api';
import type { StreamCard as StreamCardType, CreatorSearchResult } from '@/lib/discover-types';

function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [streams, setStreams] = useState<StreamCardType[]>([]);
  const [creators, setCreators] = useState<CreatorSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) { setStreams([]); setCreators([]); setLoading(false); return; }
    setLoading(true);
    apiGet<{ streams: StreamCardType[]; creators: CreatorSearchResult[] }>(`/api/discover/search?q=${encodeURIComponent(q)}`)
      .then(d => { setStreams(d.streams); setCreators(d.creators); })
      .catch(() => { setStreams([]); setCreators([]); })
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      <SiteHeader searchValue={q} />

      <div className="px-4 sm:px-8 pt-6 pb-12">
        <h1 className="text-lg sm:text-xl font-bold mb-6">
          {q ? <>Results for &ldquo;{q}&rdquo;</> : 'Search'}
        </h1>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : !q ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Type something in the search bar to find creators and streams.</p>
        ) : streams.length === 0 && creators.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No results found for &ldquo;{q}&rdquo;.</p>
        ) : (
          <>
            {creators.length > 0 && (
              <section className="mb-10">
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Creators</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {creators.map(c => <CreatorCard key={c.id} creator={c} />)}
                </div>
              </section>
            )}
            {streams.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Streams</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {streams.map(s => <StreamCard key={s.id} stream={s} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
      </div>
    }>
      <SearchResults />
    </Suspense>
  );
}
