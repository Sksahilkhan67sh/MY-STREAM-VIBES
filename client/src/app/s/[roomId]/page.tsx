'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import StreamPlayer from '@/components/StreamPlayer';
import ChatPanel from '@/components/ChatPanel';
import PollWidget from '@/components/PollWidget';
import StreamSchedulerBanner from '@/components/StreamSchedulerBanner';
import { ThemeToggle } from '@/components/ThemeContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StreamInfo {
  roomId: string; title: string; isLive: boolean;
  hasPassword: boolean; scheduledAt: string | null;
  expiresAt: string; viewerCount: number;
}

export default function ViewerPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [stream, setStream]           = useState<StreamInfo | null>(null);
  const [error, setError]             = useState('');
  const [nickname, setNickname]       = useState('');
  const [password, setPassword]       = useState('');
  const [token, setToken]             = useState('');
  const [identity, setIdentity]       = useState('');
  const [step, setStep]               = useState<'loading' | 'join' | 'watching' | 'error'>('loading');
  const [socket, setSocket]           = useState<Socket | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const nicknameRef = useRef(nickname);
  nicknameRef.current = nickname;

  const fetchStream = () =>
    fetch(`${API}/api/streams/${roomId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: StreamInfo) => { setStream(data); setStep('join'); })
      .catch(code => {
        setError(code === 404 ? 'Stream not found.' : code === 410 ? 'This stream has expired.' : 'Failed to load stream.');
        setStep('error');
      });

  useEffect(() => { fetchStream(); }, [roomId]);

  useEffect(() => {
    if (step !== 'watching') return;
    const s = io(API, { transports: ['websocket', 'polling'] });
    s.on('connect', () => {
      s.emit('join-room', { roomId, nickname: nicknameRef.current || 'Anonymous' });
      setSocketReady(true);
    });
    s.on('disconnect', () => setSocketReady(false));
    s.on('stream-started', () => setStream(prev => prev ? { ...prev, isLive: true } : prev));
    s.on('stream-ended',   () => setStream(prev => prev ? { ...prev, isLive: false } : prev));
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); setSocketReady(false); };
  }, [step, roomId]);

  const joinStream = async () => {
    setError('');
    try {
      const res = await fetch(`${API}/api/token/viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, nickname: nickname || undefined, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to join'); return; }
      setToken(data.token); setIdentity(data.identity); setStep('watching');
    } catch { setError('Failed to join. Please try again.'); }
  };

  if (step === 'loading') return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <div className="flex items-center gap-3 text-gray-400 text-sm">
        <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
        Loading stream...
      </div>
    </div>
  );

  if (step === 'error') return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-6 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <div className="text-center max-w-sm">
        <div className="text-3xl mb-4">📭</div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Stream unavailable</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500">{error}</p>
        <a href="/" className="inline-block mt-6 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors underline underline-offset-4">
          Back to home
        </a>
      </div>
    </div>
  );

  if (step === 'watching' && stream && token) return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-950"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <div className="flex-1 min-h-0 relative bg-black">
        <StreamPlayer roomId={roomId} token={token} title={stream.title} isHost={false} />
        {socketReady && <PollWidget roomId={roomId} socket={socket} />}
      </div>
      <div className="w-full lg:w-72 h-64 lg:h-screen border-t lg:border-t-0 lg:border-l border-gray-800">
        <ChatPanel roomId={roomId} identity={identity} nickname={nickname || 'Anonymous'} socket={socket} />
      </div>
    </div>
  );

  // ── Join / Scheduled view ──────────────────────────────────
  const isScheduled = stream?.scheduledAt && !stream.isLive;

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200"
      style={{ background: '#09090b', fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <nav className="flex items-center justify-between px-8 py-5 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-base tracking-tight text-zinc-100">StreamVault</span>
        </div>
        <ThemeToggle />
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm space-y-4"
        >
          {/* Title area */}
          <div className="mb-2">
            {stream?.isLive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
              </span>
            )}
            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              {stream?.title}
            </h1>
          </div>

          {/* Scheduled banner — replaces old static text */}
          {isScheduled && stream?.scheduledAt && (
            <StreamSchedulerBanner
              scheduledAt={stream.scheduledAt}
              roomId={roomId}
              title={stream.title}
              onStreamLive={() => fetchStream()}
            />
          )}

          {/* Join form */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">
                Your name
              </label>
              <input
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && joinStream()}
                placeholder="Anonymous"
                autoFocus
                className="w-full px-4 py-3 text-sm rounded-xl focus:outline-none transition-colors placeholder-zinc-600 text-zinc-100"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px' }}
              />
            </div>

            {stream?.hasPassword && (
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter stream password"
                  className="w-full px-4 py-3 text-sm rounded-xl focus:outline-none transition-colors placeholder-zinc-600 text-zinc-100"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '16px' }}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 px-4 py-2.5 rounded-xl">{error}</p>
            )}

            <button
              onClick={joinStream}
              className="w-full py-3 text-sm font-semibold rounded-xl transition-colors text-zinc-100 hover:opacity-90"
              style={{ background: isScheduled ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #ff3520, #c81405)' }}
            >
              {isScheduled ? 'Enter waiting room →' : 'Watch stream →'}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
