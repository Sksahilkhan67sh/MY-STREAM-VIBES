'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import HostControls from '@/components/HostControls';
import ScheduleModal from '@/components/ScheduleModal';
import { ThemeToggle } from '@/components/ThemeContext';
import { Calendar, Radio, Clock } from 'lucide-react';

const API     = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL  || 'http://localhost:3000';

interface StreamData {
  roomId: string; hostToken: string; livekitToken: string;
  viewerUrl: string; expiresAt: string; scheduledAt?: string;
}

type StreamMode = 'live' | 'scheduled';

export default function HostPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [title, setTitle]           = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [stream, setStream]         = useState<StreamData | null>(null);
  const [copied, setCopied]         = useState(false);
  const [mode, setMode]             = useState<StreamMode>('live');
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledAt, setScheduledAt]   = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  const createStream = async (overrideScheduledAt?: string) => {
    if (!title.trim()) { setError('Enter a stream title'); return; }
    setError(''); setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        password: password || undefined,
      };
      const effectiveSchedule = overrideScheduledAt ?? scheduledAt;
      if (effectiveSchedule) body.scheduledAt = effectiveSchedule;

      const res = await fetch(`${API}/api/streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create stream'); return; }
      setStream({ ...data, scheduledAt: effectiveSchedule ?? undefined });
    } catch {
      setError('Cannot connect to server. Is it running?');
    } finally { setLoading(false); }
  };

  const handleSchedule = (datetime: string) => {
    setScheduledAt(datetime);
    setShowSchedule(false);
    createStream(datetime);
  };

  const copyLink = () => {
    if (!stream) return;
    navigator.clipboard.writeText(`${APP_URL}${stream.viewerUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (stream) {
    return <HostControls stream={stream} appUrl={APP_URL} onCopy={copyLink} copied={copied} />;
  }

  const parsedSchedule = scheduledAt ? new Date(scheduledAt) : null;
  const formatSchedule = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100 dark:border-gray-800">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-base tracking-tight text-gray-900 dark:text-gray-100">StreamVault</span>
        </a>
        <div className="flex items-center gap-3">
          {session?.user?.image && (
            <img src={session.user.image} alt={session.user.name || ''} className="w-7 h-7 rounded-full border border-gray-200 dark:border-gray-700" />
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">{session?.user?.name}</span>
          <ThemeToggle />
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >Sign out</button>
        </div>
      </nav>

      <div className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-6 pt-8 sm:pt-0 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1 tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            Create a stream
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 sm:mb-8">
            Go live instantly or schedule for later.
          </p>

          {/* Mode toggle */}
          <div className="flex gap-1 p-1 mb-5 rounded-xl" style={{ background: 'rgba(0,0,0,0.05)' }} >
            <button
              onClick={() => { setMode('live'); setScheduledAt(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'live'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Go Live
            </button>
            <button
              onClick={() => setMode('scheduled')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === 'scheduled'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Schedule
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Stream title
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && mode === 'live' && createStream()}
                placeholder="My live stream"
                autoFocus
                className="w-full px-4 py-3.5 sm:py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl sm:rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                style={{ fontSize: '16px' }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Password <span className="text-gray-300 dark:text-gray-600 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Leave blank for public"
                className="w-full px-4 py-3.5 sm:py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl sm:rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Scheduled time display */}
            <AnimatePresence>
              {mode === 'scheduled' && parsedSchedule && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(255,53,32,0.06)', border: '1px solid rgba(255,53,32,0.15)' }}
                >
                  <Clock className="w-4 h-4 shrink-0" style={{ color: '#ff3520' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: '#ff3520' }}>Scheduled</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{formatSchedule(parsedSchedule)}</p>
                  </div>
                  <button onClick={() => { setScheduledAt(null); setShowSchedule(true); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium">
                    Edit
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 rounded-lg">{error}</p>
            )}

            {mode === 'live' ? (
              <button
                onClick={() => createStream()}
                disabled={loading}
                className="w-full py-3.5 sm:py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl sm:rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creating...' : 'Create stream →'}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (!title.trim()) { setError('Enter a stream title first'); return; }
                  setError('');
                  setShowSchedule(true);
                }}
                disabled={loading}
                className="w-full py-3.5 sm:py-3 text-sm font-semibold rounded-xl sm:rounded-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #ff3520, #c81405)',
                  color: 'white',
                }}
              >
                {loading ? 'Scheduling...' : <><Calendar className="w-4 h-4" /> Pick a date & time →</>}
              </button>
            )}
          </div>

          <p className="text-xs text-gray-300 dark:text-gray-600 text-center mt-5 sm:mt-6">
            Stream link expires after 24 hours
          </p>
        </motion.div>
      </div>

      {/* Schedule modal */}
      <AnimatePresence>
        {showSchedule && (
          <ScheduleModal
            title={title}
            onClose={() => setShowSchedule(false)}
            onSchedule={handleSchedule}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
