'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Radio } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import StreamPlayer from '@/components/StreamPlayer';
import ChatPanel from '@/components/ChatPanel';
import PollWidget from '@/components/PollWidget';
import StreamSchedulerBanner from '@/components/StreamSchedulerBanner';
import { useAnalytics } from '@/hooks/useAnalytics';
import DonationAlert from '@/components/donations/DonationAlert';
import DonationModal from '@/components/donations/DonationModal';
import { DonateButton, DonationLeaderboard } from '@/components/donations/DonationLeaderboard';
import PPVGate from '@/components/ppv/PPVGate';
import RatingWidget from '@/components/RatingWidget';
import SaveButton from '@/components/discover/SaveButton';
import { CaptionOverlay } from '@/components/LiveCaptions';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StreamInfo {
  id:           string;
  roomId:       string;
  title:        string;
  isLive:       boolean;
  hasPassword:  boolean;
  scheduledAt:  string | null;
  expiresAt:    string;
  viewerCount:  number;
  isPPV:        boolean;
  ppvPrice:     number | null;
  wizardPrefs?: { donations?: boolean; superChat?: boolean } | null;
}

// Watching a stream requires a signed-in account — see server/src/routes/token.ts
// for why (chat identity, follows, and watch history all need a real account;
// guest "type any name" viewing has been removed). middleware.ts already
// redirects signed-out visitors to /login?callbackUrl=/s/<roomId> before this
// component ever mounts, so by the time we're here `session` is expected to
// exist — the loading guard below is a defensive backstop only (e.g. session
// still hydrating client-side on first paint).
export default function ViewerPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const viewerUserId = session?.user?.id ?? session?.user?.email ?? '';
  const viewerName    = session?.user?.name ?? null;
  const viewerAvatar  = session?.user?.image ?? null;

  const [stream, setStream]       = useState<StreamInfo | null>(null);
  const [error, setError]         = useState('');
  const [password, setPassword]   = useState('');
  const [token, setToken]         = useState('');
  const [identity, setIdentity]   = useState('');
  const [nickname, setNickname]   = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [step, setStep]           = useState<'loading' | 'join' | 'watching' | 'error'>('loading');
  const [socket, setSocket]       = useState<Socket | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const [chatOpen, setChatOpen]   = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);

  // Defaults to true (the previous, unconditional behavior) whenever a
  // stream has no wizardPrefs at all — only an explicit `false` from the
  // wizard hides the donate button. This guarantees every stream created
  // before this preference existed keeps behaving exactly as it did.
  const donationsEnabled = stream?.wizardPrefs?.donations !== false;

  // ── Analytics: auto-tracks join/leave/watch-time ──
  const { trackEvent: trackAnalytics } = useAnalytics({
    roomId,
    enabled: step === 'watching',
  });

  // ── Watch history: pings every 30s while watching, for signed-in viewers ──
  // Powers AI recommendations and "Recently Watched".
  useEffect(() => {
    if (step !== 'watching' || !viewerUserId) return;
    const interval = setInterval(() => {
      fetch(`${API}/api/history/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: viewerUserId, roomId, watchSeconds: 30 }),
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [step, viewerUserId, roomId]);

  const fetchStream = useCallback(() => {
    fetch(`${API}/api/streams/${roomId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: StreamInfo) => { setStream(data); setStep(s => s === 'loading' ? 'join' : s); })
      .catch(code => {
        setError(
          code === 404 ? 'Stream not found.' :
          code === 410 ? 'This stream link has expired.' :
          'Failed to load stream.'
        );
        setStep('error');
      });
  }, [roomId]);

  useEffect(() => { fetchStream(); }, [fetchStream]);

  useEffect(() => {
    if (step !== 'watching') return;

    const s = io(API, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    s.on('connect', () => {
      // 'connect' fires on both initial connection AND every reconnect in socket.io v4
      s.emit('join-room', { roomId, nickname: nickname || 'Viewer' });
      setSocketReady(true);
    });

    s.on('disconnect', () => setSocketReady(false));

    // When host goes live, refresh stream info so video appears without manual reload
    s.on('stream-started', () => {
      setStream(prev => prev ? { ...prev, isLive: true } : prev);
    });
    s.on('stream-ended', () => {
      setStream(prev => prev ? { ...prev, isLive: false } : prev);
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setSocketReady(false);
    };
  }, [step, roomId, nickname]);

  const joinStream = async () => {
    setError('');
    if (!viewerUserId) {
      // Shouldn't normally happen — middleware gates this page — but guard
      // anyway rather than silently failing the join call.
      router.push(`/login?callbackUrl=${encodeURIComponent(`/s/${roomId}`)}`);
      return;
    }
    try {
      const res = await fetch(`${API}/api/token/viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          userId: viewerUserId,
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to join'); return; }
      setToken(data.token);
      setIdentity(data.identity);
      // Server returns the verified display name/avatar from the real
      // account — never trust client-side session fields for what gets
      // broadcast to other viewers, since session data can lag behind a
      // profile update. Falls back to the live session values only if the
      // server didn't supply them for some reason.
      setNickname(data.nickname || viewerName || 'Viewer');
      setAvatarUrl(data.avatarUrl ?? viewerAvatar ?? null);
      setStep('watching');
    } catch {
      setError('Failed to join stream. Please try again.');
    }
  };

  if (step === 'loading' || sessionStatus === 'loading') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-500">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-brand-500 rounded-full animate-spin" />
        Loading stream...
      </div>
    </div>
  );

  if (step === 'error') return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-2xl p-8 max-w-sm text-center">
        <div className="text-4xl mb-4">📭</div>
        <h2 className="font-bold text-lg mb-2">Stream Unavailable</h2>
        <p className="text-zinc-500 text-sm">{error}</p>
        <a href="/feed" className="inline-block mt-6 text-sm text-zinc-500 hover:text-zinc-200 transition-colors underline underline-offset-4">
          Back to home
        </a>
      </div>
    </div>
  );

  if (step === 'watching' && stream && token) return (
    <PPVGate
      roomId={roomId}
      streamTitle={stream.title}
      isPPV={stream.isPPV ?? false}
      ppvPrice={stream.ppvPrice ?? undefined}
      currency="INR"
    >
    <div className="fixed inset-0 flex bg-zinc-950 overflow-hidden">

      {/* ── Donation Alert overlay (all viewports) ── */}
      <DonationAlert socket={socket} roomId={roomId} />

      {/* ── Donation Modal ── */}
      <AnimatePresence>
        {showDonate && (
          <DonationModal
            roomId={roomId}
            streamerName={stream.title}
            onClose={() => setShowDonate(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Video area: fills all space left of chat ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">

        {/* Desktop: video fills entire column */}
        <div className="hidden lg:block flex-1 w-full h-full relative" style={{ height: '100%' }}>
          <div className="absolute inset-0">
            <StreamPlayer roomId={roomId} token={token} title={stream.title} isHost={false} isLive={stream.isLive} />
          </div>
          {socketReady && <PollWidget roomId={roomId} socket={socket} />}
          {socketReady && (
            <CaptionOverlay socket={socket} roomId={roomId} show={captionsOn} onToggle={() => setCaptionsOn(v => !v)} />
          )}
          {/* Desktop donate button — bottom-left of video */}
          <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2">
            {donationsEnabled && <DonateButton onClick={() => setShowDonate(true)} />}
            <button
              onClick={() => setCaptionsOn(v => !v)}
              title={captionsOn ? 'Hide captions' : 'Show captions'}
              className={`px-3 py-2 rounded-full text-xs font-bold border transition-colors ${
                captionsOn
                  ? 'bg-white text-black border-white'
                  : 'bg-black/50 text-white border-white/30 hover:bg-black/70'
              }`}
            >
              CC
            </button>
          </div>
        </div>

        {/* Mobile: video fills available height, chat toggles below */}
        <div className="flex lg:hidden flex-col w-full h-full">
          <div className="flex-1 min-h-0 bg-black relative overflow-hidden">
            <StreamPlayer roomId={roomId} token={token} title={stream.title} isHost={false} isLive={stream.isLive} />
            {socketReady && <PollWidget roomId={roomId} socket={socket} />}
            {socketReady && (
              <CaptionOverlay socket={socket} roomId={roomId} show={captionsOn} onToggle={() => setCaptionsOn(v => !v)} />
            )}
          </div>
          {/* Title bar + chat toggle + donate */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="truncate">{stream.title}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {donationsEnabled && <DonateButton onClick={() => setShowDonate(true)} />}
              <button
                onClick={() => setCaptionsOn(v => !v)}
                title={captionsOn ? 'Hide captions' : 'Show captions'}
                className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                  captionsOn
                    ? 'bg-white text-black border-white'
                    : 'text-zinc-400 border-zinc-700 hover:border-zinc-500'
                }`}
              >
                CC
              </button>
              <button
                onClick={() => setChatOpen(o => !o)}
                className="text-xs font-semibold text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors"
              >
                {chatOpen ? 'Hide chat' : 'Chat'}
              </button>
            </div>
          </div>
          <div className={`${chatOpen ? 'flex' : 'hidden'} flex-col flex-1 min-h-0`}>
            <ChatPanel roomId={roomId} identity={identity} nickname={nickname} avatarUrl={avatarUrl} socket={socket} />
          </div>
        </div>

      </div>

      {/* ── Chat sidebar (desktop only) ── */}
      <div className="hidden lg:flex w-80 flex-shrink-0 border-l border-zinc-800/60 flex-col">
        {/* Leaderboard above chat */}
        <div className="px-3 pt-3 flex items-center justify-between gap-2">
          {donationsEnabled && <div className="flex-1"><DonationLeaderboard roomId={roomId} socket={socket} currency="INR" /></div>}
          <SaveButton streamId={stream.id} className="!bg-zinc-800 hover:!bg-zinc-700 flex-shrink-0" />
        </div>
        <div className="px-3 pt-2"><RatingWidget streamId={stream.id} /></div>
        <ChatPanel roomId={roomId} identity={identity} nickname={nickname} avatarUrl={avatarUrl} socket={socket} />
      </div>

    </div>
    </PPVGate>
  );

  // ── Join / Scheduled view ──────────────────────────────────
  const isScheduled = stream?.scheduledAt && !stream.isLive;

  return (
    <main className="min-h-screen flex items-start sm:items-center justify-center px-4 pt-8 sm:pt-0">
      {/* Show countdown banner for scheduled streams — auto-advances to the
          live view once the countdown ends, without needing a manual refresh. */}
      {isScheduled && stream?.scheduledAt && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <StreamSchedulerBanner
            scheduledAt={stream.scheduledAt}
            title={stream.title}
            roomId={roomId}
            onStreamLive={fetchStream}
          />
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-6 sm:p-8 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-5 sm:mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-brand-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-base leading-tight truncate">{stream?.title}</h1>
            {isScheduled && (
              <p className="text-xs text-zinc-500 mt-0.5">Stream is scheduled</p>
            )}
          </div>
        </div>

        {/* Watching as — identity comes from the signed-in account, never
            typed in manually. */}
        <div className="flex items-center gap-2.5 mb-5 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {viewerAvatar ? (
            <img src={viewerAvatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-zinc-300">{(viewerName || 'V')[0].toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Watching as</p>
            <p className="text-sm text-zinc-200 font-medium truncate">{viewerName || 'Your account'}</p>
          </div>
        </div>

        <div className="space-y-4">
          {stream?.hasPassword && (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3 h-3" /> Stream Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && joinStream()}
                placeholder="Enter password"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 sm:py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
                style={{ fontSize: '16px' }}
              />
            </div>
          )}

          {error && (
            <p className="text-brand-400 text-sm bg-brand-500/10 border border-brand-500/20 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <button
            onClick={joinStream}
            className="w-full py-3.5 sm:py-3 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-95"
          >
            {isScheduled ? 'Enter waiting room →' : 'Watch stream →'}
          </button>
        </div>
      </motion.div>
    </main>
  );
}
