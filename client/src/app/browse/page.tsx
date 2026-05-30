'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Suspense } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const CATEGORIES = ['Gaming', 'Coding', 'Education', 'Music', 'Business', 'Art', 'IRL', 'Talk Show'];

interface Stream {
  roomId: string; title: string; isLive: boolean; viewerCount: number;
  peakViewers: number; category?: string; tags: string[];
  scheduledAt?: string; thumbnailUrl?: string; createdAt: string;
  host?: { displayName: string; avatarUrl?: string };
}

function StreamCard({ stream }: { stream: Stream }) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }} transition={{ duration: 0.15 }}
      onClick={() => router.push(`/s/${stream.roomId}`)}
      className="cursor-pointer group">
      <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden relative mb-3">
        {stream.thumbnailUrl
          ? <img src={stream.thumbnailUrl} className="w-full h-full object-cover" alt={stream.title} />
          : <div className="w-full h-full flex items-center justify-center">
              <span className="text-4xl">{stream.category === 'Gaming' ? '🎮' : stream.category === 'Coding' ? '💻' : stream.category === 'Music' ? '🎵' : '📺'}</span>
            </div>
        }
        {stream.isLive && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE
          </span>
        )}
        {stream.isLive && (
          <span className="absolute bottom-2.5 right-2.5 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">
            {stream.viewerCount} watching
          </span>
        )}
      </div>
      <div className="flex gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500 overflow-hidden">
          {stream.host?.avatarUrl
            ? <img src={stream.host.avatarUrl} className="w-full h-full object-cover" alt="" />
            : (stream.host?.displayName?.[0] || '?')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">{stream.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{stream.host?.displayName || 'Anonymous'}</p>
          {stream.category && <p className="text-xs text-gray-400 mt-0.5">{stream.category}</p>}
        </div>
      </div>
    </motion.div>
  );
}

function BrowseInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);

  const q        = searchParams.get('q')        || '';
  const category = searchParams.get('category') || '';
  const sort     = searchParams.get('sort')     || 'viewers';
  const status   = searchParams.get('status')   || '';

  const [search, setSearch] = useState(q);

  const fetchStreams = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (q)        params.set('q', q);
    if (category) params.set('category', category);
    if (status)   params.set('status', status);
    try {
      const res = await fetch(`${API}/api/streams?${params}`);
      const d = await res.json();
      setStreams(d.streams || []);
      setTotal(d.total || 0);
    } catch {}
    setLoading(false);
  }, [q, category, sort, status]);

  useEffect(() => { fetchStreams(); }, [fetchStreams]);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(searchParams.toString());
      if (search) p.set('q', search); else p.delete('q');
      router.replace(`/browse?${p}`);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const setFilter = (key: string, val: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    router.replace(`/browse?${p}`);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-10">
        <a href="/" className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="font-bold text-sm text-gray-900 dark:text-gray-100">StreamVault</span>
        </a>
        <div className="flex items-center gap-2">
          <a href="/auth/login" className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">Sign in</a>
          <a href="/host" className="text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-700 transition-colors">Go live</a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search streams…"
            className="flex-1 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
          <select value={sort} onChange={e => setFilter('sort', e.target.value)}
            className="px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:outline-none">
            <option value="viewers">Most viewers</option>
            <option value="trending">Trending</option>
            <option value="newest">Newest</option>
          </select>
          <select value={status} onChange={e => setFilter('status', e.target.value)}
            className="px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:outline-none">
            <option value="">All</option>
            <option value="live">Live now</option>
            <option value="upcoming">Upcoming</option>
          </select>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button onClick={() => setFilter('category', '')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!category ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            All
          </button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter('category', category === c ? '' : c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${category === c ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              {c}
            </button>
          ))}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            {category ? category : status === 'live' ? 'Live now' : 'All streams'}
          </h1>
          <p className="text-xs text-gray-400">{total.toLocaleString()} stream{total !== 1 ? 's' : ''}</p>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="py-20 flex justify-center"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>
        ) : streams.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-4xl mb-3">📡</p>
            <p className="text-sm text-gray-500">No streams found</p>
            <a href="/host" className="mt-4 inline-block text-xs font-medium text-gray-900 dark:text-gray-100 hover:underline">Be the first to go live →</a>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
            {streams.map(s => <StreamCard key={s.roomId} stream={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BrowsePage() {
  return <Suspense fallback={null}><BrowseInner /></Suspense>;
}
