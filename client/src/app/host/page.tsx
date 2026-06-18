'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import HostControls from '@/components/HostControls';
import ScheduleModal from '@/components/ScheduleModal';
import StreamCalendar from '@/components/StreamCalendar';
import ThumbnailUploader from '@/components/ThumbnailUploader';
import EmailNotificationPanel from '@/components/EmailNotificationPanel';
import ReplayLibrary from '@/components/ReplayLibrary';
import ModerationPanel from '@/components/ModerationPanel';
import ClipCreator from '@/components/ClipCreator';
import AITitleGenerator from '@/components/AITitleGenerator';
import AISummaryExport from '@/components/AISummaryExport';
import InlineAnalytics from '@/components/InlineAnalytics';
import InlineEarnings from '@/components/InlineEarnings';
import InlineBilling from '@/components/InlineBilling';
import InlinePricing from '@/components/InlinePricing';
import InlinePPV from '@/components/InlinePPV';
import {
  Radio, Calendar, Clock, BarChart2, DollarSign, CreditCard,
  Ticket, Image, Mail, Video, Shield, Scissors, Sparkles,
  FileText, ChevronRight, LogOut, Menu, X, Play, Zap,
} from 'lucide-react';

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// localStorage key for persisting the last hostToken per user
const LS_HOST_TOKEN = (userId: string) => `sv_hostToken_${userId}`;
const LS_ROOM_ID    = (userId: string) => `sv_roomId_${userId}`;

interface StreamData {
  roomId: string;
  hostToken: string;
  livekitToken: string;
  viewerUrl: string;
  expiresAt: string;
  scheduledAt?: string;
  title?: string;
}

interface RecentStream {
  roomId: string;
  title: string;
  isLive: boolean;
  createdAt: string;
  thumbnailUrl?: string;
}

const NAV = [
  {
    group: 'Stream',
    items: [
      { id: 'create',   label: 'Go Live',       icon: Radio,     accent: '#ff3520' },
      { id: 'calendar', label: 'Schedule',       icon: Calendar,  accent: '#f59e0b' },
      { id: 'replays',  label: 'Replay Library', icon: Video,     accent: '#6366f1' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { id: 'thumbnail',     label: 'Thumbnail',   icon: Image,    accent: '#10b981' },
      { id: 'clips',         label: 'Clips',        icon: Scissors, accent: '#ec4899' },
      { id: 'moderation',    label: 'Moderation',   icon: Shield,   accent: '#ef4444' },
      { id: 'notifications', label: 'Email Notify', icon: Mail,     accent: '#3b82f6' },
    ],
  },
  {
    group: 'AI',
    items: [
      { id: 'ai-title',   label: 'AI Title',   icon: Sparkles, accent: '#a855f7' },
      { id: 'ai-summary', label: 'AI Summary',  icon: FileText, accent: '#ff3520' },
    ],
  },
  {
    group: 'Business',
    items: [
      { id: 'analytics', label: 'Analytics',     icon: BarChart2,  accent: '#ff3520' },
      { id: 'earnings',  label: 'Earnings',       icon: DollarSign, accent: '#22c55e' },
      { id: 'billing',   label: 'Plan & Billing', icon: CreditCard, accent: '#8b5cf6' },
      { id: 'ppv',       label: 'Pay-Per-View',   icon: Ticket,     accent: '#f59e0b' },
    ],
  },
];

const STREAM_TOOL_TABS     = new Set(['thumbnail', 'clips', 'moderation', 'notifications', 'ai-title', 'ai-summary']);
const STREAM_REQUIRED_TABS = new Set(['analytics', 'ppv', ...STREAM_TOOL_TABS]);

export default function HostPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab]           = useState('create');
  const [stream, setStream]                 = useState<StreamData | null>(null);
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [title, setTitle]                   = useState('');
  const [password, setPassword]             = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [copied, setCopied]                 = useState(false);
  const [mode, setMode]                     = useState<'live' | 'scheduled'>('live');
  const [showSchedule, setShowSchedule]     = useState(false);
  const [scheduledAt, setScheduledAt]       = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [recentStreams, setRecentStreams]    = useState<RecentStream[]>([]);

  // Persisted hostToken & roomId from localStorage (survives page refresh)
  const [savedHostToken, setSavedHostToken] = useState('');
  const [savedRoomId, setSavedRoomId]       = useState('');

  const userId = session?.user?.id ?? session?.user?.email ?? '';

  // Restore stream session + saved tokens
  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;

    // Restore active stream
    try {
      const saved = sessionStorage.getItem('activeStream');
      if (saved) {
        const parsed: StreamData = JSON.parse(saved);
        if (parsed.expiresAt && new Date(parsed.expiresAt) > new Date()) {
          setStream(parsed);
        } else {
          sessionStorage.removeItem('activeStream');
        }
      }
    } catch {
      sessionStorage.removeItem('activeStream');
    }

    // Restore persisted hostToken from localStorage
    const lsToken  = localStorage.getItem(LS_HOST_TOKEN(userId)) ?? '';
    const lsRoomId = localStorage.getItem(LS_ROOM_ID(userId))    ?? '';
    setSavedHostToken(lsToken);
    setSavedRoomId(lsRoomId);

    // payment_success param
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_success') === '1') {
      setPaymentSuccess(true);
      window.history.replaceState({}, '', '/host');
      setTimeout(() => setPaymentSuccess(false), 5000);
    }
  }, [status, userId]);

  // Load recent streams
  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    fetch(`${API}/api/streams?userId=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : { streams: [] })
      .then(d => setRecentStreams((d.streams ?? []).slice(0, 3)))
      .catch(() => {});
  }, [status, userId]);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    );
  }

  // Active stream + Go Live tab → show HostControls studio
  if (stream && activeTab === 'create') {
    return (
      <>
        <AnimatePresence>
          {paymentSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl bg-green-500 text-white"
            >
              <span>🎉</span><p className="text-sm font-bold">Subscription activated!</p>
            </motion.div>
          )}
        </AnimatePresence>
        <HostControls
          stream={stream}
          appUrl={APP_URL}
          onCopy={() => {
            navigator.clipboard.writeText(`${APP_URL}${stream.viewerUrl}`);
            setCopied(true); setTimeout(() => setCopied(false), 2000);
          }}
          copied={copied}
        />
      </>
    );
  }

  const createStream = async (overrideScheduledAt?: string) => {
    if (!title.trim()) { setError('Enter a stream title'); return; }
    setError(''); setLoading(true);
    try {
      const effectiveSchedule = overrideScheduledAt ?? scheduledAt;
      const body: Record<string, unknown> = {
        title:    title.trim(),
        password: password || undefined,
        userId:   userId || undefined,
      };
      if (effectiveSchedule) body.scheduledAt = effectiveSchedule;

      const res  = await fetch(`${API}/api/streams`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create stream'); return; }

      const newStream: StreamData = { ...data, scheduledAt: effectiveSchedule ?? undefined, title: title.trim() };
      sessionStorage.setItem('activeStream', JSON.stringify(newStream));

      // Persist hostToken + roomId in localStorage so business panels work after refresh
      if (userId) {
        localStorage.setItem(LS_HOST_TOKEN(userId), newStream.hostToken);
        localStorage.setItem(LS_ROOM_ID(userId),    newStream.roomId);
        setSavedHostToken(newStream.hostToken);
        setSavedRoomId(newStream.roomId);
      }

      setStream(newStream);
      setActiveTab('create');
    } catch {
      setError('Cannot connect to server. Is it running?');
    } finally { setLoading(false); }
  };

  const handleSchedule = (datetime: string) => {
    setScheduledAt(datetime); setShowSchedule(false); createStream(datetime);
  };

  const userName  = session?.user?.name ?? session?.user?.email ?? 'Host';
  const userImage = session?.user?.image ?? null;
  const parsedSchedule = scheduledAt ? new Date(scheduledAt) : null;

  // Best hostToken available: active stream > localStorage > ''
  const bestHostToken = stream?.hostToken || savedHostToken;
  const bestRoomId    = stream?.roomId    || savedRoomId ||
    (recentStreams[0]?.roomId ?? '');

  // Best stream for tool panels
  const toolStream = stream
    ? { roomId: stream.roomId, hostToken: stream.hostToken, title: stream.title }
    : savedRoomId && savedHostToken
      ? { roomId: savedRoomId, hostToken: savedHostToken, title: recentStreams[0]?.title ?? '' }
      : recentStreams[0]
        ? { roomId: recentStreams[0].roomId, hostToken: savedHostToken, title: recentStreams[0].title }
        : null;

  const needsStream = STREAM_REQUIRED_TABS.has(activeTab) && !toolStream;

  return (
    <div className="min-h-screen bg-[#070707] flex" style={{ fontFamily: "'DM Sans','Inter',sans-serif" }}>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside className={[
        'fixed lg:relative inset-y-0 left-0 z-50 w-64',
        'bg-[#0d0d0d] border-r border-white/[0.06] flex flex-col',
        'transition-transform duration-300 ease-out',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}>

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.06]">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
            <span className="font-bold text-white text-base tracking-tight">StreamVault</span>
          </a>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.map(group => (
            <div key={group.group} className="mb-5">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-3 mb-1.5">
                {group.group}
              </p>
              {group.items.map(item => {
                const Icon     = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5',
                      isActive ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: isActive ? `${item.accent}20` : 'transparent' }}
                    >
                      <Icon className="w-3.5 h-3.5" style={{ color: isActive ? item.accent : 'currentColor' }} />
                    </div>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-white/[0.06]">
          {stream && (
            <button
              onClick={() => setActiveTab('create')}
              className="w-full flex items-center gap-2.5 p-3 rounded-xl bg-[#ff3520]/10 border border-[#ff3520]/20 mb-3 hover:bg-[#ff3520]/15 transition-colors text-left"
            >
              <div className="w-2 h-2 rounded-full bg-[#ff3520] animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{stream.title ?? 'Live stream'}</p>
                <p className="text-[#ff3520] text-[10px] font-semibold">LIVE · Click to return</p>
              </div>
            </button>
          )}
          <div className="flex items-center gap-3">
            {userImage
              ? <img src={userImage} alt="" className="w-8 h-8 rounded-full border border-white/10 flex-shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-[#ff3520]/20 border border-[#ff3520]/30 flex items-center justify-center text-[#ff3520] text-sm font-bold flex-shrink-0">
                  {userName[0]?.toUpperCase()}
                </div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{userName}</p>
              <p className="text-zinc-600 text-[10px] truncate">{session?.user?.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              title="Sign out"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] bg-[#0d0d0d]">
          <button onClick={() => setSidebarOpen(true)} className="text-zinc-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />
            <span className="text-white font-bold text-sm">StreamVault</span>
          </div>
          {stream
            ? <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#ff3520]/20 border border-[#ff3520]/30">
                <div className="w-1.5 h-1.5 rounded-full bg-[#ff3520] animate-pulse" />
                <span className="text-[#ff3520] text-[10px] font-bold">LIVE</span>
              </div>
            : <div className="w-8" />
          }
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="min-h-full"
            >

              {/* ── GO LIVE ── */}
              {activeTab === 'create' && (
                <div className="flex items-center justify-center min-h-full px-4 py-12">
                  <div className="w-full max-w-sm">
                    <div className="mb-8">
                      <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Create a stream</h1>
                      <p className="text-zinc-500 text-sm">Go live instantly or schedule for later.</p>
                    </div>

                    <div className="flex gap-1 p-1 mb-6 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                      {(['live', 'scheduled'] as const).map(m => (
                        <button key={m}
                          onClick={() => { setMode(m); if (m === 'live') setScheduledAt(null); }}
                          className={['flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                            mode === m ? 'bg-white/[0.10] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'].join(' ')}
                        >
                          {m === 'live' ? <Radio className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                          {m === 'live' ? 'Go Live' : 'Schedule'}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Stream title</label>
                        <input
                          value={title} onChange={e => setTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && mode === 'live') createStream(); }}
                          placeholder="My live stream" autoFocus style={{ fontSize: '16px' }}
                          className="w-full px-4 py-3 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-700 focus:outline-none focus:border-white/20 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                          Password <span className="text-zinc-700 font-normal normal-case">(optional)</span>
                        </label>
                        <input
                          type="password" value={password} onChange={e => setPassword(e.target.value)}
                          placeholder="Leave blank for public" style={{ fontSize: '16px' }}
                          className="w-full px-4 py-3 text-sm bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-700 focus:outline-none focus:border-white/20 transition-colors"
                        />
                      </div>

                      <AnimatePresence>
                        {mode === 'scheduled' && parsedSchedule && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#ff3520]/10 border border-[#ff3520]/20"
                          >
                            <Clock className="w-4 h-4 text-[#ff3520] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[#ff3520] text-xs font-semibold">Scheduled</p>
                              <p className="text-zinc-400 text-xs truncate">
                                {parsedSchedule.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at{' '}
                                {parsedSchedule.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            </div>
                            <button onClick={() => { setScheduledAt(null); setShowSchedule(true); }} className="text-xs text-zinc-500 hover:text-white">Edit</button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</p>}

                      {mode === 'live' ? (
                        <button onClick={() => createStream()} disabled={loading}
                          className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-[#ff3520] hover:bg-[#e02e1a] disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                          {loading ? 'Creating...' : 'Create stream'}
                        </button>
                      ) : (
                        <button onClick={() => { if (!title.trim()) { setError('Enter a stream title first'); return; } setError(''); setShowSchedule(true); }}
                          disabled={loading}
                          className="w-full py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
                          style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}>
                          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Calendar className="w-4 h-4" />}
                          {loading ? 'Scheduling...' : 'Pick date & time'}
                        </button>
                      )}
                    </div>

                    <p className="text-zinc-700 text-xs text-center mt-5">Stream link expires after 24 hours</p>

                    {recentStreams.length > 0 && (
                      <div className="mt-8">
                        <p className="text-zinc-600 text-[11px] font-bold uppercase tracking-widest mb-3">Recent</p>
                        <div className="space-y-2">
                          {recentStreams.map(s => (
                            <div key={s.roomId} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors">
                              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                {s.isLive ? <div className="w-2 h-2 rounded-full bg-[#ff3520] animate-pulse" /> : <Play className="w-3.5 h-3.5 text-zinc-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-semibold truncate">{s.title}</p>
                                <p className="text-zinc-600 text-[10px]">{new Date(s.createdAt).toLocaleDateString()}</p>
                              </div>
                              {s.isLive && <span className="text-[#ff3520] text-[10px] font-bold flex-shrink-0">LIVE</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── CALENDAR ── */}
              {activeTab === 'calendar' && (
                <div className="p-6 lg:p-8">
                  <SectionHeader title="Schedule" subtitle="Plan and manage your upcoming streams" icon={Calendar} accent="#f59e0b" />
                  <div className="mt-6">
                    <StreamCalendar
                      userId={userId}
                      onClose={() => setActiveTab('create')}
                      onCreateScheduled={(dt) => { setScheduledAt(dt); setMode('scheduled'); setActiveTab('create'); }}
                      inline
                    />
                  </div>
                </div>
              )}

              {/* ── REPLAY LIBRARY ── */}
              {activeTab === 'replays' && (
                <ReplayLibrary userId={userId} onClose={() => setActiveTab('create')} inline />
              )}

              {/* ── STREAM TOOL PANELS (need roomId + hostToken) ── */}
              {STREAM_TOOL_TABS.has(activeTab) && (
                toolStream
                  ? <StreamToolPanel activeTab={activeTab} stream={toolStream} userId={userId} />
                  : <NoStreamPlaceholder tab={activeTab} onGoLive={() => setActiveTab('create')} />
              )}

              {/* ── ANALYTICS ── */}
              {activeTab === 'analytics' && (
                bestHostToken && bestRoomId
                  ? <InlineAnalytics roomId={bestRoomId} hostToken={bestHostToken} onBack={() => setActiveTab('create')} />
                  : <NoStreamPlaceholder tab="analytics" onGoLive={() => setActiveTab('create')} />
              )}

              {/* ── EARNINGS ── */}
              {activeTab === 'earnings' && (
                <InlineEarnings hostToken={bestHostToken} onBack={() => setActiveTab('create')} />
              )}

              {/* ── BILLING ── */}
              {activeTab === 'billing' && (
                <InlineBilling hostToken={bestHostToken} onBack={() => setActiveTab('create')} onUpgrade={() => setActiveTab('pricing')} />
              )}

              {/* ── PRICING ── */}
              {activeTab === 'pricing' && (
                <InlinePricing hostToken={bestHostToken} onBack={() => setActiveTab('billing')} onSuccess={() => setActiveTab('billing')} />
              )}

              {/* ── PAY-PER-VIEW ── */}
              {activeTab === 'ppv' && (
                bestHostToken && bestRoomId
                  ? <InlinePPV roomId={bestRoomId} hostToken={bestHostToken} onBack={() => setActiveTab('create')} />
                  : <NoStreamPlaceholder tab="ppv" onGoLive={() => setActiveTab('create')} />
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Schedule modal */}
      <AnimatePresence>
        {showSchedule && (
          <ScheduleModal title={title} onClose={() => setShowSchedule(false)} onSchedule={handleSchedule} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, icon: Icon, accent }: { title: string; subtitle: string; icon: React.ElementType; accent: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}20`, border: `1px solid ${accent}30` }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-zinc-500 text-sm">{subtitle}</p>
      </div>
    </div>
  );
}

function NoStreamPlaceholder({ tab, onGoLive }: { tab: string; onGoLive: () => void }) {
  const LABELS: Record<string, string> = {
    thumbnail: 'Upload a thumbnail', clips: 'Create clips', moderation: 'Moderate viewers',
    notifications: 'Send email notifications', 'ai-title': 'Generate AI titles',
    'ai-summary': 'Generate an AI summary', analytics: 'View analytics', ppv: 'Set up Pay-Per-View',
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-24 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-5">
        <Zap className="w-7 h-7 text-zinc-700" />
      </div>
      <h2 className="text-white font-bold text-lg mb-2">Start a stream first</h2>
      <p className="text-zinc-500 text-sm mb-6 max-w-xs">{LABELS[tab] ?? 'This feature'} requires an active or recent stream.</p>
      <button onClick={onGoLive} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#ff3520] text-white font-semibold text-sm hover:bg-[#e02e1a] transition-colors">
        <Radio className="w-4 h-4" /> Go Live Now
      </button>
    </div>
  );
}

const TOOL_CONFIG: Record<string, { icon: React.ElementType; accent: string; title: string; subtitle: string }> = {
  thumbnail:     { icon: Image,    accent: '#10b981', title: 'Thumbnail',           subtitle: 'Upload a custom thumbnail for your stream' },
  clips:         { icon: Scissors, accent: '#ec4899', title: 'Clips & Highlights',  subtitle: 'Mark and manage stream clip highlights' },
  moderation:    { icon: Shield,   accent: '#ef4444', title: 'Moderation',          subtitle: 'Ban, timeout, and filter your chat' },
  notifications: { icon: Mail,     accent: '#3b82f6', title: 'Email Notifications', subtitle: 'Send updates and reminders to viewers' },
  'ai-title':    { icon: Sparkles, accent: '#a855f7', title: 'AI Title Generator',  subtitle: 'Generate optimised titles with Claude AI' },
  'ai-summary':  { icon: FileText, accent: '#ff3520', title: 'AI Summary Export',   subtitle: 'Auto-summarise your stream with Claude AI' },
};

function StreamToolPanel({ activeTab, stream, userId }: { activeTab: string; stream: { roomId: string; hostToken: string; title?: string }; userId: string }) {
  const cfg = TOOL_CONFIG[activeTab];
  if (!cfg) return null;
  return (
    <div className="flex flex-col min-h-full">
      <div className="px-6 lg:px-8 py-6 border-b border-white/[0.06]">
        <SectionHeader title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon} accent={cfg.accent} />
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
          Stream: <span className="text-zinc-400 font-medium ml-1">{stream.title ?? stream.roomId}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl">
          {activeTab === 'thumbnail'     && <ThumbnailUploader     roomId={stream.roomId} hostToken={stream.hostToken} />}
          {activeTab === 'clips'         && <ClipCreator           roomId={stream.roomId} hostToken={stream.hostToken} />}
          {activeTab === 'moderation'    && <ModerationPanel       roomId={stream.roomId} hostToken={stream.hostToken} userId={userId} />}
          {activeTab === 'notifications' && <EmailNotificationPanel roomId={stream.roomId} hostToken={stream.hostToken} streamTitle={stream.title ?? ''} />}
          {activeTab === 'ai-title'      && <AITitleGenerator      roomId={stream.roomId} hostToken={stream.hostToken} currentTitle={stream.title ?? ''} />}
          {activeTab === 'ai-summary'    && <AISummaryExport       roomId={stream.roomId} hostToken={stream.hostToken} streamTitle={stream.title ?? ''} />}
        </div>
      </div>
    </div>
  );
}
