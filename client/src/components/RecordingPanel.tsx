'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Circle, Square, Download, Trash2, Clock, HardDrive, RefreshCw, Film } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const CHUNK_INTERVAL_MS = 2000; // send chunk every 2s

interface Recording {
  id: string;
  fileName: string;
  fileSize: number;
  durationSec: number;
  startedAt: string;
  endedAt: string;
  downloadUrl: string;
}

interface RecordingPanelProps {
  roomId: string;
  hostToken: string;
  /** Pass the MediaStream(s) you want to record */
  streams: MediaStream[];
  onRecordingChange?: (isRecording: boolean) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RecordingPanel({
  roomId,
  hostToken,
  streams,
  onRecordingChange,
}: RecordingPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkTimerRef    = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef  = useRef<NodeJS.Timeout | null>(null);
  const pendingChunks    = useRef<Blob[]>([]);

  // Load existing recordings on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const res = await fetch(
        `${API}/api/egress/recordings/${roomId}?hostToken=${hostToken}`
      );
      if (res.ok) setRecordings(await res.json());
    } catch {}
  };

  // ── Send accumulated chunks to server ────────────────────────
  const flushChunks = useCallback(async () => {
    if (pendingChunks.current.length === 0) return;
    const blob = new Blob(pendingChunks.current, { type: 'video/webm' });
    pendingChunks.current = [];

    try {
      await fetch(`${API}/api/egress/chunk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'video/webm',
          'x-room-id': roomId,
          'x-host-token': hostToken,
        },
        body: blob,
      });
    } catch (e) {
      console.warn('Chunk upload failed:', e);
    }
  }, [roomId, hostToken]);

  // ── Start recording ──────────────────────────────────────────
  const startRecording = async () => {
    setError('');
    if (streams.length === 0) {
      setError('Start Camera or Screen first before recording.');
      return;
    }

    setLoading(true);
    try {
      // Tell server to start
      const res = await fetch(`${API}/api/egress/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to start recording');
      }

      // Combine all active streams into one
      const combined = new MediaStream();
      streams.forEach(s => {
        s.getTracks().forEach(t => combined.addTrack(t));
      });

      // Pick best supported format
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

      const mr = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_500_000 });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) pendingChunks.current.push(e.data);
      };

      // Collect chunks frequently so we don't lose data
      mr.start(500);

      // Upload chunks every 2 seconds
      chunkTimerRef.current = setInterval(flushChunks, CHUNK_INTERVAL_MS);

      // Elapsed timer
      setElapsed(0);
      elapsedTimerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

      setIsRecording(true);
      onRecordingChange?.(true);
    } catch (e: any) {
      setError(e.message || 'Failed to start recording');
    } finally {
      setLoading(false);
    }
  };

  // ── Stop recording ───────────────────────────────────────────
  const stopRecording = async () => {
    setLoading(true);
    try {
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        await new Promise(r => setTimeout(r, 600)); // wait for last ondataavailable
      }
      mediaRecorderRef.current = null;

      // Clear timers
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);

      // Flush remaining chunks
      await flushChunks();

      // Tell server to stop & finalize
      const res = await fetch(`${API}/api/egress/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken }),
      });

      setIsRecording(false);
      setElapsed(0);
      onRecordingChange?.(false);

      if (res.ok) {
        const data = await res.json();
        // Refresh list
        await loadRecordings();
        setError('');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to stop recording');
    } finally {
      setLoading(false);
    }
  };

  // ── Download recording ───────────────────────────────────────
  const downloadRecording = (rec: Recording) => {
    const a = document.createElement('a');
    a.href = `${API}${rec.downloadUrl}`;
    a.download = rec.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Delete recording ─────────────────────────────────────────
  const deleteRecording = async (rec: Recording) => {
    if (!confirm(`Delete ${rec.fileName}? This cannot be undone.`)) return;
    setDeleting(rec.id);
    try {
      const res = await fetch(`${API}/api/egress/recordings/${rec.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      });
      if (res.ok) setRecordings(rs => rs.filter(r => r.id !== rec.id));
    } catch {}
    setDeleting(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-brand-500" />
          <span className="font-bold text-sm">Recordings</span>
          {isRecording && (
            <span className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full text-xs font-bold text-red-400">
              <span className="live-dot" /> {formatDuration(elapsed)}
            </span>
          )}
        </div>
        <button onClick={loadRecordings} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors">
          <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* Record / Stop button */}
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={loading || streams.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" /> Starting...</>
              : <><Circle className="w-4 h-4" /> Start Recording</>}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-all disabled:opacity-60"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
              : <><Square className="w-4 h-4 fill-white" /> Stop & Save Recording</>}
          </button>
        )}

        {streams.length === 0 && !isRecording && (
          <p className="text-xs text-zinc-600 text-center">
            Enable Camera or Screen first to record
          </p>
        )}

        {/* Recordings list */}
        {recordings.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Saved Recordings ({recordings.length})
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recordings.map(rec => (
                <div key={rec.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-mono text-zinc-300 truncate flex-1">
                      {rec.fileName}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => downloadRecording(rec)}
                        title="Download"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-green-500/20 hover:text-green-400 text-zinc-400 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteRecording(rec)}
                        disabled={deleting === rec.id}
                        title="Delete"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(rec.durationSec)}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {formatSize(rec.fileSize)}
                    </span>
                    <span className="ml-auto">
                      {new Date(rec.startedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recordings.length === 0 && !isRecording && (
          <p className="text-xs text-zinc-700 text-center py-2">
            No recordings yet
          </p>
        )}
      </div>
    </div>
  );
}
