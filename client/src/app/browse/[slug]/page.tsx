'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SiteHeader from '@/components/discover/SiteHeader';
import CategoryPills from '@/components/discover/CategoryPills';
import StreamCard from '@/components/discover/StreamCard';
import { apiGet } from '@/lib/api';
import type { CategoryLite, StreamCard as StreamCardType } from '@/lib/discover-types';
import { useUserRole } from '@/hooks/useUserRole';

const LANGUAGES = [
  { code: '', label: 'Any language' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'pt', label: 'Portuguese' },
];

export default function CategoryBrowsePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;
  const { isCreator } = useUserRole();

  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [streams, setStreams] = useState<StreamCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState('');
  const [minViewers, setMinViewers] = useState('');
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'premium'>('all');
  const [sort, setSort] = useState<'viewers' | 'newest'>('viewers');

  useEffect(() => {
    apiGet<{ categories: CategoryLite[] }>('/api/discover/categories')
      .then(d => setCategories(d.categories))
      .catch(() => {});
  }, []);

  const activeCategory = categories.find(c => c.slug === slug);

  const fetchStreams = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams({ category: slug, sort });
    if (language) qs.set('language', language);
    if (minViewers) qs.set('minViewers', minViewers);
    if (priceFilter === 'free') qs.set('free', 'true');
    if (priceFilter === 'premium') qs.set('free', 'false');

    apiGet<{ streams: StreamCardType[]; total: number }>(`/api/discover/live?${qs.toString()}`)
      .then(d => setStreams(d.streams))
      .catch(() => setStreams([]))
      .finally(() => setLoading(false));
  }, [slug, language, minViewers, priceFilter, sort]);

  useEffect(() => { fetchStreams(); }, [fetchStreams]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      <SiteHeader />

      <div className="pt-5 pb-1">
        <CategoryPills categories={categories} activeSlug={slug} />
      </div>

      <div className="px-4 sm:px-8 pt-5">
        <h1 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2">
          {activeCategory ? <>{activeCategory.icon} {activeCategory.name}</> : 'Browse'}
        </h1>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <select
            value={language} onChange={e => setLanguage(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
          >
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>

          <select
            value={minViewers} onChange={e => setMinViewers(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
          >
            <option value="">Any viewer count</option>
            <option value="10">10+ viewers</option>
            <option value="100">100+ viewers</option>
            <option value="1000">1,000+ viewers</option>
          </select>

          <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800">
            {(['all', 'free', 'premium'] as const).map(f => (
              <button
                key={f}
                onClick={() => setPriceFilter(f)}
                className={[
                  'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize',
                  priceFilter === f ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400',
                ].join(' ')}
              >
                {f}
              </button>
            ))}
          </div>

          <select
            value={sort} onChange={e => setSort(e.target.value as 'viewers' | 'newest')}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 ml-auto"
          >
            <option value="viewers">Most viewers</option>
            <option value="newest">Recently started</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : streams.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">No live streams match these filters right now.</p>
            {isCreator && (
              <button onClick={() => router.push('/studio')} className="px-6 py-3 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors">
                Start streaming →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 pb-12">
            {streams.map(s => <StreamCard key={s.id} stream={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}
