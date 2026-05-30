'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface AnalyticsData {
  stream: { roomId: string; title: string; isLive: boolean; createdAt: string };
  metrics: {
    currentViewers: number; peakViewers: number; totalJoins: number;
    avgWatchSec: number; chatMessages: number; reactions: number;
    pollParticipationPct: number; totalPolls: number; totalRecordings: number;
  };
  timeline: { time: string; viewers: number; chats: number }[];
  polls: { id: string; question: string; status: string; totalVotes: number }[];
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function MiniChart({ data, color = '#3b82f6' }: { data: { value: number }[]; color?: string }) {
  if (!data.length) return <div className="h-16 flex items-center justify-center text-xs text-gray-400">No data yet</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 rounded-sm transition-all" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0, backgroundColor: color, opacity: 0.7 + (i / data.length) * 0.3 }} />
      ))}
    </div>
  );
}

function fmtSec(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export default function AnalyticsPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const hostToken = localStorage.getItem(`hostToken:${roomId}`) || new URLSearchParams(window.location.search).get('hostToken') || '';
    fetch(`${API}/api/analytics/${roomId}?hostToken=${hostToken}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Failed to load analytics'));
  }, [roomId]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
      <div className="text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">← Go back</button>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  );

  const { metrics, timeline, polls, stream } = data;
  const viewerTimeline = timeline.slice(-48).map(t => ({ value: t.viewers }));
  const chatTimeline   = timeline.slice(-48).map(t => ({ value: t.chats }));

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">←</button>
          <div>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{stream.title}</h1>
            <p className="text-xs text-gray-400">{stream.isLive ? '🔴 Live' : 'Ended'} · Analytics</p>
          </div>
        </div>
        {stream.isLive && <span className="flex items-center gap-1.5 text-xs font-medium text-red-500"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Live</span>}
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Core metrics */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard label="Peak viewers" value={metrics.peakViewers} />
            <MetricCard label="Current viewers" value={metrics.currentViewers} />
            <MetricCard label="Total joins" value={metrics.totalJoins} />
            <MetricCard label="Avg. watch time" value={fmtSec(metrics.avgWatchSec)} />
            <MetricCard label="Chat messages" value={metrics.chatMessages} />
            <MetricCard label="Reactions" value={metrics.reactions} />
          </div>
        </motion.div>

        {/* Viewer timeline */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Viewer activity</h2>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Concurrent viewers</p>
              <span className="text-xs text-gray-400">Last 4 hours</span>
            </div>
            <MiniChart data={viewerTimeline} color="#3b82f6" />
          </div>
        </motion.div>

        {/* Chat activity */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Chat activity</p>
              <span className="text-xs text-gray-400">Messages / 5 min</span>
            </div>
            <MiniChart data={chatTimeline} color="#22c55e" />
          </div>
        </motion.div>

        {/* Engagement */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Engagement</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-5">
              <p className="text-xs text-gray-400 mb-1">Poll participation</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{metrics.pollParticipationPct}%</p>
              <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${metrics.pollParticipationPct}%` }} />
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-5">
              <p className="text-xs text-gray-400 mb-1">Polls run</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{metrics.totalPolls}</p>
              <p className="text-xs text-gray-400 mt-1">{metrics.totalRecordings} recording{metrics.totalRecordings !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </motion.div>

        {/* Polls breakdown */}
        {polls.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}>
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Polls</h2>
            <div className="space-y-2">
              {polls.map(poll => (
                <div key={poll.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{poll.question}</p>
                    <p className="text-xs text-gray-400">{poll.totalVotes} votes · {poll.status}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${poll.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {poll.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
