/**
 * client/src/components/LiveCaptions.tsx
 * PHASE 6 — Live Captions Component
 *
 * For HOST: renders the control button + audio capture worklet
 * For VIEWER: renders the caption overlay
 *
 * Usage in HostControls.tsx:
 *   <LiveCaptions socket={socket} roomId={roomId} hostToken={hostToken} isHost />
 *
 * Usage in viewer-page.tsx:
 *   <LiveCaptions socket={socket} roomId={roomId} />
 */

'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Captions, CaptionsOff, Download, Mic, MicOff, Languages } from 'lucide-react';
import type { Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── PCM Audio Worklet (injected as blob URL) ──────────────────────────────────
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 4096;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const samples = input[0];
    // Convert Float32 → Int16
    const int16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
    }
    this.port.postMessage({ type: 'pcm', buffer: int16.buffer }, [int16.buffer]);
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

// ── Supported languages ───────────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
];

// ── Caption segment type ──────────────────────────────────────────────────────
interface CaptionSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  language: string;
  isFinal: boolean;
  speaker?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// VIEWER CAPTION OVERLAY
// ══════════════════════════════════════════════════════════════════════════════

export function CaptionOverlay({
  socket,
  roomId,
  show,
  onToggle,
}: {
  socket: Socket | null;
  roomId: string;
  show: boolean;
  onToggle: () => void;
}) {
  const [captions, setCaptions] = useState<CaptionSegment[]>([]);
  const [interim, setInterim]   = useState<string>('');
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!socket) return;
    socket.emit('caption:getStatus', { roomId });

    socket.on('caption:status', ({ active }: { active: boolean }) => setIsActive(active));
    socket.on('caption:segment', (seg: CaptionSegment) => {
      if (seg.isFinal) {
        setCaptions(prev => [...prev.slice(-4), seg]); // keep last 5
        setInterim('');
      } else {
        setInterim(seg.text);
      }
    });
    return () => {
      socket.off('caption:status');
      socket.off('caption:segment');
    };
  }, [socket, roomId]);

  const displaySegments = captions.slice(-2); // show last 2 final lines

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-none z-30">
      <AnimatePresence>
        {show && isActive && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="text-center"
          >
            {displaySegments.map((seg, i) => (
              <p
                key={seg.startMs}
                className={`inline-block mx-auto text-white text-lg font-medium leading-snug
                  bg-black/70 backdrop-blur-sm px-3 py-1 rounded-lg mb-1 block
                  ${i < displaySegments.length - 1 ? 'opacity-60' : ''}`}
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
              >
                {seg.speaker && <span className="text-yellow-300 mr-1.5 text-sm">{seg.speaker}:</span>}
                {seg.text}
              </p>
            ))}
            {interim && (
              <p className="inline-block mx-auto text-white/80 text-lg font-medium leading-snug
                bg-black/50 backdrop-blur-sm px-3 py-1 rounded-lg block italic">
                {interim}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HOST CAPTIONS CONTROL
// ══════════════════════════════════════════════════════════════════════════════

export function HostCaptionsControl({
  socket,
  roomId,
  hostToken,
}: {
  socket: Socket | null;
  roomId: string;
  hostToken: string;
}) {
  const [isActive, setIsActive]     = useState(false);
  const [language, setLanguage]     = useState('en');
  const [showPanel, setShowPanel]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);

  const stopCapture = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCapture = useCallback(async () => {
    if (!socket) return;

    // Request microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 }, video: false });
    streamRef.current = stream;

    // Build AudioContext at 16kHz
    const ctx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = ctx;

    // Inject PCM worklet
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const url  = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const source  = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, 'pcm-processor');
    workletNodeRef.current = worklet;

    worklet.port.onmessage = (e) => {
      if (e.data.type === 'pcm') {
        socket.emit('caption:audio', { roomId, chunk: e.data.buffer });
      }
    };
    source.connect(worklet);
    worklet.connect(ctx.destination);
  }, [socket, roomId]);

  const toggle = async () => {
    setLoading(true);
    setError('');
    try {
      if (!isActive) {
        socket?.emit('caption:start', { roomId, hostToken, language });
        await startCapture();
        setIsActive(true);
      } else {
        socket?.emit('caption:stop', { roomId, hostToken });
        stopCapture();
        setIsActive(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Listen for confirmation
  useEffect(() => {
    if (!socket) return;
    socket.on('caption:started', () => setIsActive(true));
    socket.on('caption:stopped', () => setIsActive(false));
    socket.on('caption:error', ({ message }: { message: string }) => setError(message));
    return () => { socket.off('caption:started'); socket.off('caption:stopped'); socket.off('caption:error'); };
  }, [socket]);

  // Cleanup on unmount
  useEffect(() => () => stopCapture(), [stopCapture]);

  const downloadTranscript = async (format: 'txt' | 'srt' | 'vtt') => {
    const url = `${API}/api/captions/download/${roomId}?format=${format}`;
    window.open(url, '_blank');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
          ${isActive
            ? 'bg-blue-500 text-white border border-blue-400'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}
      >
        {isActive ? <Captions className="w-4 h-4" /> : <CaptionsOff className="w-4 h-4" />}
        Captions
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
      </button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="absolute bottom-full mb-2 left-0 w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden z-50"
          >
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Captions className="w-4 h-4" /> AI Live Captions
              </h3>
            </div>

            <div className="p-4 space-y-3">
              {/* Language selector */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  <Languages className="w-3.5 h-3.5" /> Language
                </label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  disabled={isActive}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white disabled:opacity-50 transition"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Toggle */}
              <button
                onClick={toggle}
                disabled={loading}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition
                  ${isActive
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800'} disabled:opacity-50`}
              >
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : isActive ? (
                  <><MicOff className="w-4 h-4" /> Stop Captions</>
                ) : (
                  <><Mic className="w-4 h-4" /> Start Captions</>
                )}
              </button>

              {/* Download transcript */}
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Download Transcript
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['txt', 'srt', 'vtt'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => downloadTranscript(fmt)}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 uppercase tracking-wide transition"
                    >
                      .{fmt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
