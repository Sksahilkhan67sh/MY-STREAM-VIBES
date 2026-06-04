'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Users, Eye, TrendingUp, Clock, MessageSquare,
  BarChart2, Globe, Monitor, Smartphone, Tablet,
  ArrowLeft, RefreshCw, Download, Activity,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  totalJoins: number;
  uniqueViewers: number;
  peakConcurrent: number;
  totalWatchSeconds: number;
  avgWatchSeconds: number;
  totalChatMessages: number;
  totalReactions: number;
  totalPollVotes: number;
  chatEngagementRate: number;
  deviceBreakdown: Record<string, number>;
  countryBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  retentionCurve: number[];
  concurrentTimeline: { ts: string; count: number }[];
  durationSeconds: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(sec: number) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const BRAND   = '#ff3520';
const COLORS  = ['#ff3520', '#ff6b61', '#ff9f97', '#ffc7c2', '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color = BRAND,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-black text-zinc-100 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">{children}</h2>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-xl text-xs" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? BRAND }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const { roomId }  = useParams<{ roomId: string }>();
  const router      = useRouter();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [isLive, setIsLive]   = useState(false);

  const hostToken = typeof window !== 'undefined'
    ? sessionStorage.getItem(`hostToken_${roomId}`) ?? ''
    : '';

  const load = useCallback(async () => {
    if (!hostToken) { setError('Host token not found. Return to your stream.'); setLoading(false); return; }
    try {
      const res = await fetch(`${API}/api/analytics/${roomId}/dashboard?hostToken=${encodeURIComponent(hostToken)}`);
      if (!res.ok) { setError('Could not load analytics.'); setLoading(false); return; }
      const json = await res.json();
      setData(json);

      // Also check if live
      const sr = await fetch(`${API}/api/streams/${roomId}`);
      if (sr.ok) { const s = await sr.json(); setIsLive(s.isLive); }
    } catch {
      setError('Network error.');
    } finally { setLoading(false); }
  }, [roomId, hostToken]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10s when live
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [isLive, load]);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-400 text-sm">
        <Activity className="w-4 h-4 animate-pulse text-[#ff3520]" />
        Loading analytics…
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <button onClick={() => router.back()} className="text-xs text-zinc-500 underline">← Go back</button>
      </div>
    </div>
  );

  if (!data) return null;

  // ── Prepare chart data ──
  const timelineData = (data.concurrentTimeline ?? []).slice(-60).map((p, i) => ({
    name:  new Date(p.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    count: p.count,
  }));

  const retentionData = (data.retentionCurve ?? []).map((v, i) => ({
    name:      `${i}m`,
    retention: v,
  }));

  const deviceData = Object.entries(data.deviceBreakdown ?? {}).map(([k, v]) => ({ name: k, value: v }));
  const countryData = Object.entries(data.countryBreakdown ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => ({ name: k, viewers: v }));
  const browserData = Object.entries(data.browserBreakdown ?? {}).map(([k, v]) => ({ name: k, value: v }));

  const engagementTotal = data.totalChatMessages + data.totalReactions + data.totalPollVotes;

  return (
    <div className="min-h-screen bg-zinc-950" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-zinc-800/60"
        style={{ background: 'rgba(9,9,11,0.9)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-zinc-100">Stream Analytics</h1>
            <p className="text-xs text-zinc-500">{roomId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          )}
          <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* ── KPI Cards ── */}
        <section>
          <SectionTitle>Overview</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Users}        label="Total Joins"       value={fmtNum(data.totalJoins)}       sub="all-time joins"                       />
            <StatCard icon={Eye}          label="Unique Viewers"    value={fmtNum(data.uniqueViewers)}    sub="distinct sessions"   color="#3b82f6"   />
            <StatCard icon={TrendingUp}   label="Peak Concurrent"   value={fmtNum(data.peakConcurrent)}   sub="at one time"         color="#8b5cf6"   />
            <StatCard icon={Clock}        label="Avg Watch Time"    value={fmtTime(data.avgWatchSeconds)} sub="per viewer"          color="#22c55e"   />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <StatCard icon={MessageSquare} label="Chat Messages"   value={fmtNum(data.totalChatMessages)}   sub={`${data.chatEngagementRate.toFixed(1)} msg/viewer`} color="#f59e0b" />
            <StatCard icon={Activity}      label="Reactions"       value={fmtNum(data.totalReactions)}      sub="emoji reactions"                        color="#ec4899" />
            <StatCard icon={BarChart2}     label="Poll Votes"      value={fmtNum(data.totalPollVotes)}      sub="votes cast"                             color="#06b6d4" />
            <StatCard icon={Clock}         label="Stream Duration" value={fmtTime(data.durationSeconds)}    sub="total stream time"                      color="#a78bfa" />
          </div>
        </section>

        {/* ── Concurrent Timeline ── */}
        {timelineData.length > 0 && (
          <section>
            <SectionTitle>Concurrent Viewers</SectionTitle>
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timelineData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="concGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={BRAND} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={BRAND} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" name="Viewers" stroke={BRAND} strokeWidth={2} fill="url(#concGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* ── Viewer Retention ── */}
        {retentionData.length > 1 && (
          <section>
            <SectionTitle>Viewer Retention</SectionTitle>
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs text-zinc-500 mb-4">Percentage of viewers still watching at each minute mark</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={retentionData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="retention" name="Retention %" stroke="#3b82f6" strokeWidth={2} fill="url(#retGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* ── 3-column: Device / Browser / Geo ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Device Breakdown */}
          <section>
            <SectionTitle>Devices</SectionTitle>
            <div className="rounded-2xl p-5 h-64 flex flex-col" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {deviceData.length === 0 ? (
                <p className="text-xs text-zinc-600 m-auto">No data yet</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={deviceData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                        {deviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {deviceData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-zinc-400 capitalize">{d.name}</span>
                        </div>
                        <span className="text-zinc-300 font-semibold">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Browser Breakdown */}
          <section>
            <SectionTitle>Browsers</SectionTitle>
            <div className="rounded-2xl p-5 h-64 flex flex-col" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {browserData.length === 0 ? (
                <p className="text-xs text-zinc-600 m-auto">No data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={browserData} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Viewers" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Engagement Breakdown */}
          <section>
            <SectionTitle>Engagement</SectionTitle>
            <div className="rounded-2xl p-5 h-64 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {[
                { label: 'Chat messages', value: data.totalChatMessages, color: '#f59e0b', icon: '💬' },
                { label: 'Reactions',     value: data.totalReactions,     color: '#ec4899', icon: '❤️' },
                { label: 'Poll votes',    value: data.totalPollVotes,     color: '#06b6d4', icon: '📊' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">{item.label}</span>
                      <span className="text-zinc-200 font-semibold">{fmtNum(item.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          background: item.color,
                          width: engagementTotal > 0
                            ? `${Math.round((item.value / engagementTotal) * 100)}%`
                            : '0%',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-auto pt-3 border-t border-zinc-800">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Engagement rate</span>
                  <span className="text-zinc-200 font-bold">
                    {data.uniqueViewers > 0
                      ? `${Math.round((engagementTotal / data.uniqueViewers) * 100) / 100}x`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Top Countries ── */}
        {countryData.length > 0 && (
          <section>
            <SectionTitle>Top Countries</SectionTitle>
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={countryData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="viewers" name="Viewers" fill={BRAND} radius={[4, 4, 0, 0]}>
                    {countryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}
