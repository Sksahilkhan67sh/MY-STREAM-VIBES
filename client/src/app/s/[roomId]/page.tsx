'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import StreamPlayer from '@/components/StreamPlayer';
import ChatPanel from '@/components/ChatPanel';
import PollWidget from '@/components/PollWidget';
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

  useEffect(() => {
    fetch(`${API}/api/streams/${roomId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: StreamInfo) => { setStream(data); setStep('join'); })
      .catch(code => {
        setError(code === 404 ? 'Stream not found.' : code === 410 ? 'This stream has expired.' : 'Failed to load stream.');
        setStep('error');
      });
  }, [roomId]);

  useEffect(() => {
    if (step !== 'watching') return;
    const s = io(API, { transports: ['websocket', 'polling'] });
    s.on('connect', () => {
      s.emit('join-room', { roomId, nickname: nicknameRef.current || 'Anonymous' });
      setSocketReady(true);
    });
    s.on('disconnect', () => setSocketReady(false));
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

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="font-bold text-base tracking-tight text-gray-900 dark:text-gray-100">StreamVault</span>
        </div>
        <ThemeToggle />
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8">
            {stream?.isLive && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 px-2.5 py-1 rounded-full mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
              </span>
            )}
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight"
              style={{ letterSpacing: '-0.02em' }}>
              {stream?.title}
            </h1>
            {stream?.scheduledAt && !stream.isLive && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Scheduled for {new Date(stream.scheduledAt).toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Your name
              </label>
              <input
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && joinStream()}
                placeholder="Anonymous"
                autoFocus
                className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                  focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors
                  placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100
                  bg-white dark:bg-gray-900"
              />
            </div>

            {stream?.hasPassword && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter stream password"
                  className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                    focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors
                    placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100
                    bg-white dark:bg-gray-900"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 rounded-lg">{error}</p>
            )}

            <button
              onClick={joinStream}
              className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold
                rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
            >
              Watch stream →
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
