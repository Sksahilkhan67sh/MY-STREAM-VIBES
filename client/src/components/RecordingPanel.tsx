'use client';
import { useState, useRef, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Recording {
  id: string; fileName: string; fileSize: number;
  durationSec: number; startedAt: string; endedAt: string | null;
  downloadUrl: string; exists: boolean;
}

interface RecordingPanelProps {
  roomId: string; hostToken: string; streams: MediaStream[];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDur(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RecordingPanel({ roomId, hostToken, streams }: RecordingPanelProps) {
  const [recording, setRecording]   = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const mrRef         = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const timerRef      = useRef<NodeJS.Timeout | null>(null);
  const elapsedRef    = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    try {
      const res = await fetch(
        `${API}/api/egress/recordings/${roomId}?hostToken=${hostToken}`
      );
      if (res.ok) setRecordings(await res.json());
    } catch {}
  };

  // Retry fetching until at least one recording has exists=true (server still writing)
  const fetchRecordingsWithRetry = async (attempts = 6, delayMs = 2000) => {
    for (let i = 0; i < attempts; i++) {
      await new Promise(r => setTimeout(r, delayMs));
      try {
        const res = await fetch(
          `${API}/api/egress/recordings/${roomId}?hostToken=${hostToken}`
        );
        if (res.ok) {
          const data: Recording[] = await res.json();
          setRecordings(data);
          if (data.some(r => r.exists)) return; // file is ready — stop retrying
        }
      } catch {}
    }
    // Final fallback fetch
    fetchRecordings();
  };

  const flushChunks = async () => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    chunksRef.current = [];
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
    } catch (e) { console.warn('Chunk upload failed:', e); }
  };

  const startRecording = async () => {
    if (streams.length === 0) {
      setError('Enable camera or screen first');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/egress/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Failed to start'); setLoading(false); return;
      }

      const combined = new MediaStream();
      streams.forEach(s => s.getTracks().forEach(t => combined.addTrack(t)));

      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

      const mr = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_500_000 });
      mrRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(500);
      timerRef.current = setInterval(flushChunks, 2000);

      // Elapsed timer
      setElapsed(0);
      elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

      setRecording(true);
    } catch (e: any) {
      setError(e.message || 'Failed to start recording');
    }
    setLoading(false);
  };

  const stopRecording = async () => {
    setLoading(true);

    // 1. Wait for MediaRecorder to fully stop before flushing (fixes missing last chunk)
    await new Promise<void>((resolve) => {
      if (mrRef.current && mrRef.current.state !== 'inactive') {
        mrRef.current.onstop = () => resolve();
        mrRef.current.stop();
      } else {
        resolve();
      }
    });
    mrRef.current = null;

    // 2. Clear all timers
    if (timerRef.current)  { clearInterval(timerRef.current);  timerRef.current  = null; }
    if (elapsedRef.current){ clearInterval(elapsedRef.current); elapsedRef.current = null; }

    // 3. Flush remaining chunks AFTER recorder has stopped (all data is available now)
    await flushChunks();

    // 4. Tell server to finalize the file
    try {
      await fetch(`${API}/api/egress/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken }),
      });
    } catch {}

    setRecording(false);
    setElapsed(0);
    setLoading(false);

    // 5. Poll until server finishes writing the file (fixes download not working)
    fetchRecordingsWithRetry();
  };

  const deleteRecording = async (id: string) => {
    try {
      await fetch(`${API}/api/egress/recordings/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      });
      setRecordings(prev => prev.filter(r => r.id !== id));
    } catch {}
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* Record button */}
      {!recording ? (
        <button
          onClick={startRecording}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          {loading ? 'Starting...' : 'Start recording'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-semibold text-red-600">Recording</span>
            </div>
            <span className="text-sm font-mono text-red-500">{formatDur(elapsed)}</span>
          </div>
          <button
            onClick={stopRecording}
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-800 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Stopping...' : 'Stop recording'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {streams.length === 0 && !recording && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Enable camera or screen first</p>
      )}

      {/* Production storage warning */}
      {recordings.length === 0 && !recording && (
        <div className="text-xs px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400">
          ⚠️ Recordings are stored temporarily. Configure S3 in server env vars for permanent storage.
        </div>
      )}

      {/* Recordings list */}
      {recordings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Saved recordings
          </p>
          {recordings.map(r => (
            <div key={r.id} className="border border-gray-100 dark:border-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">{r.fileName}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {formatDur(r.durationSec)} · {formatSize(r.fileSize)}
                    {!r.exists && <span className="text-amber-400 ml-1">· processing...</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.exists ? (
                  <a
                    href={`${API}${r.downloadUrl}${r.downloadUrl?.includes('?') ? '&' : '?'}hostToken=${encodeURIComponent(hostToken)}`}
                    download={r.fileName}
                    className="flex-1 text-center py-1.5 text-xs font-semibold text-white bg-gray-900 dark:bg-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    ⬇ Download
                  </a>
                ) : (
                  <button
                    onClick={fetchRecordings}
                    className="flex-1 text-center py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-800 transition-colors"
                  >
                    ↻ Refresh
                  </button>
                )}
                <button
                  onClick={() => deleteRecording(r.id)}
                  className="px-3 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
