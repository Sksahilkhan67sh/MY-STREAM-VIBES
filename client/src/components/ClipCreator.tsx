'use client';
/**
 * client/src/components/ClipCreator.tsx
 * Feature 7: Stream Clips / Highlights
 *
 * Host panel to:
 * - Mark clip start/end during live stream
 * - View + manage clips
 * - Share clip links
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors, Play, Clock, Share2, Trash2, Plus,
  X, Check, Copy, Film, Download,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface Clip {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  startFormatted: string;
  endFormatted: string;
  url?: string;
  thumbnailUrl?: string;
  status: string;
  viewCount: number;
  createdAt: string;
}

interface ClipCreatorProps {
  roomId: string;
  hostToken: string;
  streamStartTime?: number; // epoch ms when stream started
  onClose?: () => void;
}

function formatElapsed(startMs: number): string {
  const sec = Math.floor((Date.now() - startMs) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export default function ClipCreator({ roomId, hostToken, streamStartTime, onClose }: ClipCreatorProps) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [clipStart, setClipStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState('0:00');
  const [clipTitle, setClipTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Update elapsed time every second
  useEffect(() => {
    if (!streamStartTime) return;
    timerRef.current = setInterval(() => setElapsed(formatElapsed(streamStartTime)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [streamStartTime]);

  const loadClips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/clips/${roomId}`);
      if (res.ok) {
        const data = await res.json();
        setClips(data.clips || []);
      }
    } catch { } finally { setLoading(false); }
  }, [roomId]);

  useEffect(() => { loadClips(); }, [loadClips]);

  const getCurrentSec = () => {
    if (!streamStartTime) return 0;
    return Math.floor((Date.now() - streamStartTime) / 1000);
  };

  const handleMarkStart = () => {
    setClipStart(getCurrentSec());
    setClipTitle('');
  };

  const handleCreateClip = async () => {
    if (clipStart === null) return;
    const endSec = getCurrentSec();
    if (endSec <= clipStart) {
      alert('End time must be after start time');
      return;
    }
    if (endSec - clipStart > 300) {
      alert('Clips cannot exceed 5 minutes');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/clips/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          title: clipTitle || `Clip at ${formatSec(clipStart)}`,
          startSec: clipStart,
          endSec,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setClipStart(null);
      setClipTitle('');
      setCreated(true);
      setTimeout(() => setCreated(false), 2000);
      await loadClips();
    } catch { } finally { setCreating(false); }
  };

  const handleDelete = async (clipId: string) => {
    await fetch(`${API}/api/clips/${clipId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken }),
    });
    setClips(prev => prev.filter(c => c.id !== clipId));
  };

  const handleCopyLink = (clipId: string) => {
    navigator.clipboard.writeText(`${APP_URL}/clip/${clipId}`);
    setCopiedId(clipId);
    setTimeout(() => setCopiedId(null), 2000);
    fetch(`${API}/api/clips/${clipId}/view`, { method: 'POST' }).catch(() => {});
  };

  const clipDuration = clipStart !== null ? Math.max(0, getCurrentSec() - clipStart) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-[#ff3520]" />
          <span className="text-white font-semibold text-sm">Clips & Highlights</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Clip recorder */}
      <div className="p-4 border-b border-white/10">
        {streamStartTime ? (
          <div className="bg-white/3 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            {/* Live timer */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-zinc-400 text-xs font-mono">Live: {elapsed}</span>
              </div>
              {clipStart !== null && (
                <span className="text-[#ff3520] text-xs font-mono font-semibold">
                  Clip: {formatSec(clipDuration)}
                </span>
              )}
            </div>

            {clipStart !== null ? (
              <>
                <div className="flex items-center gap-2 p-2 bg-[#ff3520]/10 border border-[#ff3520]/20 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-[#ff3520] animate-pulse" />
                  <span className="text-[#ff3520] text-xs">Recording clip from {formatSec(clipStart)}…</span>
                </div>
                <input
                  value={clipTitle}
                  onChange={e => setClipTitle(e.target.value)}
                  placeholder="Clip title (optional)"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#ff3520]/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setClipStart(null); setClipTitle(''); }}
                    className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateClip}
                    disabled={creating}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#ff3520] text-white text-sm font-semibold hover:bg-[#e02e1a] disabled:opacity-50 transition-colors"
                  >
                    {creating ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                     : created ? <Check className="w-3.5 h-3.5" />
                     : <Scissors className="w-3.5 h-3.5" />}
                    {creating ? 'Creating…' : created ? 'Created!' : 'Cut Clip'}
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={handleMarkStart}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold text-sm hover:bg-white/10 transition-colors"
              >
                <Plus className="w-4 h-4 text-[#ff3520]" />
                Mark Clip Start
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white/3 border border-white/10 rounded-xl p-4 text-center">
            <Film className="w-6 h-6 text-zinc-700 mx-auto mb-2" />
            <p className="text-zinc-500 text-sm">Start streaming to create clips</p>
          </div>
        )}
      </div>

      {/* Clips list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
            Clips ({clips.length})
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-[#ff3520] rounded-full animate-spin" />
          </div>
        ) : clips.length === 0 ? (
          <div className="text-center py-8 text-zinc-700 text-sm">
            No clips yet — mark a start point during your stream!
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {clips.map(clip => (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white/3 border border-white/10 rounded-xl p-3 flex items-center gap-3"
              >
                {/* Icon */}
                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Film className="w-4 h-4 text-zinc-500" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{clip.title}</p>
                  <div className="flex items-center gap-2 text-zinc-500 text-xs mt-0.5">
                    <span className="font-mono">{clip.startFormatted} → {clip.endFormatted}</span>
                    <span>·</span>
                    <span>{clip.durationSec}s</span>
                    <span>·</span>
                    <span>{clip.viewCount} views</span>
                  </div>
                  <div className={`inline-flex items-center gap-1 mt-1 text-xs px-1.5 py-0.5 rounded-full
                    ${clip.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                      clip.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-zinc-500/20 text-zinc-400'}`}
                  >
                    {clip.status}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={() => handleCopyLink(clip.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                    title="Copy link"
                  >
                    {copiedId === clip.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(clip.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
