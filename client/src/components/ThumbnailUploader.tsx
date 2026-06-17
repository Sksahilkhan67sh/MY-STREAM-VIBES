'use client';
/**
 * client/src/components/ThumbnailUploader.tsx
 * Feature 2: Stream Thumbnails
 *
 * Drag-and-drop thumbnail upload with preview.
 * Converts to base64, sends to server which stores URL.
 * Used inside HostControls panel.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Upload, X, Check, Sparkles, Trash2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ThumbnailUploaderProps {
  roomId: string;
  hostToken: string;
  onClose?: () => void;
}

interface Thumbnail {
  id: string;
  url: string;
  isActive: boolean;
  source: string;
  createdAt: string;
}

export default function ThumbnailUploader({ roomId, hostToken, onClose }: ThumbnailUploaderProps) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API}/api/thumbnails/${roomId}`)
      .then(r => r.ok ? r.json() : { thumbnails: [] })
      .then(d => setThumbnails(d.thumbnails || []))
      .catch(() => {});
  }, [roomId]);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    setError('');
    try {
      // In production, upload to S3 and get URL back
      // For now, we use the base64 as the URL (works for demo; swap for S3 in prod)
      const res = await fetch(`${API}/api/thumbnails/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, url: preview, source: 'upload' }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      setThumbnails(prev => [data, ...prev.map((t: Thumbnail) => ({ ...t, isActive: false }))]);
      setSuccess(true);
      setPreview(null);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      setError('Failed to save thumbnail. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API}/api/thumbnails/${roomId}/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      });
      setThumbnails(prev => prev.filter(t => t.id !== id));
    } catch { setError('Failed to delete'); }
  };

  const activeThumbnail = thumbnails.find(t => t.isActive);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-[#ff3520]" />
          <span className="text-white font-semibold text-sm">Stream Thumbnail</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 text-zinc-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Current active thumbnail */}
      {activeThumbnail && !preview && (
        <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video">
          <img src={activeThumbnail.url} alt="Current thumbnail" className="w-full h-full object-cover" />
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-green-500/20 border border-green-500/40 rounded-full px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-green-400 text-xs font-semibold">Active</span>
          </div>
          <button
            onClick={() => handleDelete(activeThumbnail.id)}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          <button
            onClick={() => setPreview(null)}
            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#ff3520] text-white text-sm font-semibold hover:bg-[#e02e1a] disabled:opacity-50 transition-colors"
            >
              {saving ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                       : success ? <Check className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : success ? 'Saved!' : 'Set as Thumbnail'}
            </button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      {!preview && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-all
            ${dragging ? 'border-[#ff3520] bg-[#ff3520]/10' : 'border-white/20 hover:border-white/40 bg-white/3'}`}
        >
          <Upload className={`w-6 h-6 ${dragging ? 'text-[#ff3520]' : 'text-zinc-500'}`} />
          <p className="text-sm text-zinc-400 text-center">
            <span className="text-white font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-zinc-600">PNG, JPG, WebP · Max 5MB · 16:9 recommended</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Thumbnail history */}
      {thumbnails.filter(t => !t.isActive).length > 0 && (
        <div>
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2">History</p>
          <div className="grid grid-cols-3 gap-2">
            {thumbnails.filter(t => !t.isActive).slice(0, 6).map(t => (
              <div key={t.id} className="relative rounded-lg overflow-hidden aspect-video border border-white/10 group">
                <img src={t.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button
                    onClick={async () => {
                      const res = await fetch(`${API}/api/thumbnails/${roomId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hostToken, url: t.url, source: 'upload' }),
                      });
                      if (res.ok) {
                        setThumbnails(prev => prev.map(x => ({ ...x, isActive: x.id === t.id })));
                      }
                    }}
                    className="w-6 h-6 rounded bg-green-500/80 flex items-center justify-center"
                    title="Set active"
                  >
                    <Check className="w-3 h-3 text-white" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="w-6 h-6 rounded bg-red-500/80 flex items-center justify-center"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
