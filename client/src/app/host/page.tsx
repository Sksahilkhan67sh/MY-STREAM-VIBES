'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import HostControls from '@/components/HostControls';
import { ThemeToggle } from '@/components/ThemeContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface StreamData {
  roomId: string; hostToken: string; livekitToken: string;
  viewerUrl: string; expiresAt: string;
}

export default function HostPage() {
  const [title, setTitle]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [stream, setStream]     = useState<StreamData | null>(null);
  const [copied, setCopied]     = useState(false);

  const createStream = async () => {
    if (!title.trim()) { setError('Enter a stream title'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create stream'); return; }
      setStream(data);
    } catch {
      setError('Cannot connect to server. Is it running?');
    } finally { setLoading(false); }
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

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100 dark:border-gray-800">
        <a href="/" className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="font-bold text-base tracking-tight text-gray-900 dark:text-gray-100">StreamVault</span>
        </a>
        <ThemeToggle />
      </nav>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1 tracking-tight"
            style={{ letterSpacing: '-0.02em' }}>
            Create a stream
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-8">
            You'll get a shareable link instantly.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Stream title
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createStream()}
                placeholder="My live stream"
                autoFocus
                className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                  focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors
                  placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100
                  bg-white dark:bg-gray-900"
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
                className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                  focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors
                  placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100
                  bg-white dark:bg-gray-900"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 rounded-lg">{error}</p>
            )}

            <button
              onClick={createStream}
              disabled={loading}
              className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold
                rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create stream →'}
            </button>
          </div>

          <p className="text-xs text-gray-300 dark:text-gray-600 text-center mt-6">
            Stream link expires after 24 hours
          </p>
        </motion.div>
      </div>
    </div>
  );
}
