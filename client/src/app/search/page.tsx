'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import StreamCard from '@/components/discover/StreamCard';
import CreatorCard from '@/components/discover/CreatorCard';
import { apiGet } from '@/lib/api';
import type { StreamCard as StreamCardType, CreatorSearchResult, CategoryLite } from '@/lib/discover-types';

const LANGUAGES = [
  { code: '', label: 'Any language' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
];

function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [streams, setStreams] = useState<StreamCardType[]>([]);
  const [creators, setCreators] = useState<CreatorSearchResult[]>([]);
  const [matchedCategories, setMatchedCategories] = useState<CategoryLite[]>([]);
  const [matchedTags, setMatchedTags] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [trendingCreators, setTrendingCreators] = useState<CreatorSearchResult[]>([]);
  const [trendingCategories, setTrendingCategories] = useState<CategoryLite[]>([]);
  const [trendingTags, setTrendingTags] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('');
  const [tag, setTag] = useState('');

  useEffect(() => {
    apiGet<{ categories: CategoryLite[] }>('/api/discover/categories').then(d => setCategories(d.categories)).catch(() => {});
    apiGet<{ creators: CreatorSearchResult[]; categories: CategoryLite[]; tags: { tag: string; count: number }[] }>('/api/discover/trending-search')
      .then(d => { setTrendingCreators(d.creators); setTrendingCategories(d.categories); setTrendingTags(d.tags); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const hasFilters = !!(category || language || tag);
    if (!q && !hasFilters) { setStreams([]); setCreators([]); setLoading(false); return; }
    setLoading(true);
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (category) qs.set('category', category);
    if (language) qs.set('language', language);
    if (tag) qs.set('tag', tag);
    apiGet<{ streams: StreamCardType[]; creators: CreatorSearchResult[]; categories?: CategoryLite[]; tags?: string[] }>(`/api/discover/search?${qs.toString()}`)
      .then(d => {
        setStreams(d.streams);
        setCreators(d.creators);
        setMatchedCategories(d.categories || []);
        setMatchedTags(d.tags || []);
      })
      .catch(() => { setStreams([]); setCreators([]); setMatchedCategories([]); setMatchedTags([]); })
      .finally(() => setLoading(false));
  }, [q, category, language, tag]);

  const hasResults = streams.length > 0 || creators.length > 0;
  const hasQuery = !!(q || category || language || tag);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      <SiteHeader searchValue={q} />

      <div className="px-4 sm:px-8 pt-6 pb-12">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg sm:text-xl font-bold">
            {q ? <>Results for &ldquo;{q}&rdquo;</> : 'Search'}
          </h1>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={['flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors',
              showFilters || category || language || tag ? 'border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 text-gray-500'].join(' ')}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-6 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
            <select value={category} onChange={e => setCategory(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <option value="">Any category</option>
              {categories.map(c => <option key={c.id} value={c.slug}>{c.icon} {c.name}</option>)}
            </select>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <input value={tag} onChange={e => setTag(e.target.value)} placeholder="Tag (e.g. speedrun)" className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" />
            {(category || language || tag) && (
              <button onClick={() => { setCategory(''); setLanguage(''); setTag(''); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
          </div>
        ) : !hasQuery ? (
          <div className="space-y-8">
            {trendingCreators.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Trending Creators</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {trendingCreators.map(c => <CreatorCard key={c.id} creator={c} />)}
                </div>
              </section>
            )}
            {trendingCategories.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Trending Categories</h2>
                <div className="flex flex-wrap gap-2">
                  {trendingCategories.map(c => (
                    <a key={c.id} href={`/browse/${c.slug}`} className="text-sm font-semibold px-4 py-2 rounded-full bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      {c.icon} {c.name}
                    </a>
                  ))}
                </div>
              </section>
            )}
            {trendingTags.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Trending Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {trendingTags.map(t => (
                    <button key={t.tag} onClick={() => setTag(t.tag)} className="text-sm font-semibold px-4 py-2 rounded-full bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      #{t.tag}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {trendingCreators.length === 0 && trendingCategories.length === 0 && trendingTags.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">Type something in the search bar, or use filters, to find creators and streams.</p>
            )}
          </div>
        ) : !hasResults ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">No results found{q ? <> for &ldquo;{q}&rdquo;</> : ''}.</p>
        ) : (
          <>
            {matchedCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <span className="text-xs text-gray-400">Browse category:</span>
                {matchedCategories.map(c => (
                  <a key={c.id} href={`/browse/${c.slug}`} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    {c.icon} {c.name}
                  </a>
                ))}
              </div>
            )}
            {matchedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <span className="text-xs text-gray-400">Tags:</span>
                {matchedTags.map(t => (
                  <button
                    key={t}
                    onClick={() => setTag(t)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      tag === t ? 'bg-red-500 text-white' : 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            )}
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
