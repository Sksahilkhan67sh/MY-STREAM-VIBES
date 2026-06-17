'use client';
/**
 * client/src/components/ReplayLibrary.tsx
 * Feature 4: Replay Library
 *
 * Full-screen panel showing all past recordings with:
 * - Search/filter
 * - Edit title/description/tags
 * - Toggle public/private
 * - View count
 * - Download link
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Search, Filter, Edit2, Globe, Lock, Eye,
  Download, Clock, Tag, X, Check, Trash2, Video,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Replay {
  id: string;
  streamId: string;
  roomId: string;
  streamTitle: string;
  thumbnailUrl?: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  durationSec: number;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  isPublic: boolean;
  title: string;
  description?: string;
  tags: string[];
  viewCount: number;
  metaId?: string;
}

interface ReplayLibraryProps {
  userId: string;
  onClose: () => void;
  inline?: boolean;
}

function fmtDuration(sec: number): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export default function ReplayLibrary({ userId, onClose, inline }: ReplayLibraryProps) {
  const [replays, setReplays] = useState<Replay[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', tags: '', isPublic: false });
  const [saving, setSaving] = useState(false);

  const loadReplays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/replays/user/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setReplays(data.replays || []);
      }
    } catch { } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { loadReplays(); }, [loadReplays]);

  const filtered = replays.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.streamTitle.toLowerCase().includes(search.toLowerCase()) ||
    r.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const startEdit = (replay: Replay) => {
    setEditingId(replay.id);
    setEditForm({
      title: replay.title,
      description: replay.description || '',
      tags: replay.tags.join(', '),
      isPublic: replay.isPublic,
    });
  };

  const saveEdit = async (replay: Replay) => {
    setSaving(true);
    try {
      // We need roomId + a hostToken from sessionStorage
      const hostToken = sessionStorage.getItem(`hostToken_${replay.roomId}`) || '';
      await fetch(`${API}/api/replays/${replay.id}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          roomId: replay.roomId,
          title: editForm.title,
          description: editForm.description,
          tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
          isPublic: editForm.isPublic,
        }),
      });
      setReplays(prev => prev.map(r =>
        r.id === replay.id
          ? { ...r, title: editForm.title, description: editForm.description, tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean), isPublic: editForm.isPublic }
          : r
      ));
      setEditingId(null);
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className={inline ? "flex flex-col min-h-full" : "fixed inset-0 z-50 bg-[#070707] flex flex-col"}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#ff3520]/10 border border-[#ff3520]/20 flex items-center justify-center">
            <Video className="w-4 h-4 text-[#ff3520]" />
          </div>
          <div>
            <h2 className="text-white font-bold">Replay Library</h2>
            <p className="text-zinc-500 text-xs">{replays.length} recording{replays.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search replays…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#ff3520]/40"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-[#ff3520] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Video className="w-12 h-12 text-zinc-800" />
            <p className="text-zinc-500 font-medium">No recordings found</p>
            <p className="text-zinc-700 text-sm">Your past streams will appear here</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(replay => (
              <motion.div
                key={replay.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-zinc-900 flex items-center justify-center">
                  {replay.thumbnailUrl ? (
                    <img src={replay.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Video className="w-8 h-8 text-zinc-700" />
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/20 border border-white/40 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white ml-1" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/80 rounded-md px-1.5 py-0.5 text-white text-xs font-mono">
                    {fmtDuration(replay.durationSec)}
                  </div>
                  <div className="absolute top-2 left-2">
                    {replay.isPublic
                      ? <Globe className="w-3.5 h-3.5 text-green-400" />
                      : <Lock className="w-3.5 h-3.5 text-zinc-400" />}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  {editingId === replay.id ? (
                    <div className="flex flex-col gap-2">
                      <input
                        value={editForm.title}
                        onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#ff3520]/50"
                        placeholder="Title"
                      />
                      <textarea
                        value={editForm.description}
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs resize-none h-16 focus:outline-none focus:border-[#ff3520]/50"
                        placeholder="Description (optional)"
                      />
                      <input
                        value={editForm.tags}
                        onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-zinc-300 text-xs focus:outline-none focus:border-[#ff3520]/50"
                        placeholder="Tags: gaming, tutorial, q&a"
                      />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editForm.isPublic} onChange={e => setEditForm(f => ({ ...f, isPublic: e.target.checked }))} className="rounded" />
                        <span className="text-zinc-400 text-xs">Make public</span>
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-xs hover:bg-white/10 transition-colors">Cancel</button>
                        <button onClick={() => saveEdit(replay)} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-[#ff3520] text-white text-xs font-semibold hover:bg-[#e02e1a] disabled:opacity-50 transition-colors">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-white font-semibold text-sm line-clamp-1">{replay.title}</h3>
                      {replay.description && <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2">{replay.description}</p>}
                      {replay.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {replay.tags.slice(0, 3).map(t => (
                            <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400">{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3 text-zinc-600 text-xs">
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{replay.viewCount}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(replay.createdAt).toLocaleDateString()}</span>
                        <span>{fmtSize(replay.fileSize)}</span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => startEdit(replay)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-xs hover:bg-white/10 hover:text-white transition-colors"
                        >
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                        <a
                          href={replay.filePath}
                          download={replay.fileName}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-xs hover:bg-white/10 hover:text-white transition-colors"
                          onClick={() => {
                            fetch(`${API}/api/replays/${replay.id}/view`, { method: 'POST' }).catch(() => {});
                          }}
                        >
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
