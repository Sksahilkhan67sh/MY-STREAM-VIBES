'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Radio, Clock } from 'lucide-react';
import StreamPlayer from '@/components/StreamPlayer';
import ChatPanel from '@/components/ChatPanel';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StreamInfo {
  roomId: string;
  title: string;
  isLive: boolean;
  hasPassword: boolean;
  scheduledAt: string | null;
  expiresAt: string;
  viewerCount: number;
}

export default function ViewerPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [identity, setIdentity] = useState('');
  const [step, setStep] = useState<'loading' | 'join' | 'watching' | 'error'>('loading');

  useEffect(() => {
    fetch(`${API}/api/streams/${roomId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: StreamInfo) => { setStream(data); setStep('join'); })
      .catch(code => {
        setError(code === 404 ? 'Stream not found.' : code === 410 ? 'This stream link has expired.' : 'Failed to load stream.');
        setStep('error');
      });
  }, [roomId]);

  const joinStream = async () => {
    try {
      const res = await fetch(`${API}/api/token/viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, nickname: nickname || undefined, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to join'); return; }
      setToken(data.token);
      setIdentity(data.identity);
      setStep('watching');
    } catch {
      setError('Failed to join stream. Please try again.');
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-brand-500 rounded-full animate-spin" />
          Loading stream...
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-2xl p-8 max-w-sm text-center">
          <div className="text-4xl mb-4">📭</div>
          <h2 className="font-bold text-lg mb-2">Stream Unavailable</h2>
          <p className="text-zinc-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (step === 'watching' && stream && token) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row bg-zinc-950">
        <div className="flex-1 min-h-0">
          <StreamPlayer
            roomId={roomId}
            token={token}
            title={stream.title}
            isHost={false}
          />
        </div>
        <div className="w-full lg:w-80 h-64 lg:h-screen border-t lg:border-t-0 lg:border-l border-zinc-800/60">
          <ChatPanel roomId={roomId} identity={identity} nickname={nickname || 'Anonymous'} />
        </div>
      </div>
    );
  }

  // Join screen
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-8 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">{stream?.title}</h1>
            {stream?.scheduledAt && !stream.isLive && (
              <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                Scheduled: {new Date(stream.scheduledAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Your Nickname</label>
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="Anonymous"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {stream?.hasPassword && (
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3 h-3" /> Stream Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          )}

          {error && (
            <p className="text-brand-400 text-sm bg-brand-500/10 border border-brand-500/20 rounded-lg px-4 py-2">{error}</p>
          )}

          <button
            onClick={joinStream}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-95"
          >
            Join Stream →
          </button>
        </div>
      </motion.div>
    </main>
  );
}
