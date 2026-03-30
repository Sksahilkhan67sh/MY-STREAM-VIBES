'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Copy, Check, ExternalLink, Calendar, Video, Mic, MicOff, VideoOff, Square, Circle } from 'lucide-react';
import Link from 'next/link';
import HostControls from '@/components/HostControls';
import ScheduleModal from '@/components/ScheduleModal';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface StreamData {
  roomId: string;
  hostToken: string;
  livekitToken: string;
  viewerUrl: string;
  expiresAt: string;
}

export default function HostPage() {
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamData | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [tab, setTab] = useState<'create' | 'schedule'>('create');
  const [error, setError] = useState('');

  const createStream = async (scheduledAt?: string) => {
    if (!title.trim()) { setError('Please enter a stream title'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), password: password || undefined, scheduledAt }),
      });
      if (!res.ok) throw new Error('Failed to create stream');
      const data = await res.json();
      setStream(data);
    } catch (e) {
      setError('Could not create stream. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!stream) return;
    navigator.clipboard.writeText(`${APP}${stream.viewerUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (stream) {
    return <HostControls stream={stream} appUrl={APP} onCopy={copyLink} copied={copied} />;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-brand-600/8 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <Link href="/" className="flex items-center gap-2 mb-8 text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
          ← Back
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-2xl tracking-tight">New Stream</h1>
            <p className="text-zinc-500 text-sm">Go live in seconds</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex glass rounded-xl p-1 mb-6">
          {(['create', 'schedule'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize
                ${tab === t ? 'bg-brand-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {t === 'create' ? '⚡ Go Live Now' : '📅 Schedule'}
            </button>
          ))}
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Stream Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && tab === 'create' && createStream()}
              placeholder="My awesome stream..."
              maxLength={100}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
              Password <span className="text-zinc-600 normal-case font-normal">(optional)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Leave blank for public stream"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-brand-400 text-sm bg-brand-500/10 border border-brand-500/20 rounded-lg px-4 py-2">{error}</p>
          )}

          {tab === 'create' ? (
            <button
              onClick={() => createStream()}
              disabled={loading}
              className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-95"
            >
              {loading ? 'Creating...' : '🔴 Create Stream'}
            </button>
          ) : (
            <button
              onClick={() => setShowSchedule(true)}
              disabled={!title.trim()}
              className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-bold rounded-xl transition-all"
            >
              📅 Schedule Stream
            </button>
          )}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          All streams expire in 24h · End-to-end encrypted
        </p>
      </motion.div>

      {showSchedule && (
        <ScheduleModal
          title={title}
          onClose={() => setShowSchedule(false)}
          onSchedule={(dt) => { setShowSchedule(false); createStream(dt); }}
        />
      )}
    </main>
  );
}
