'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface RtmpModalProps {
  roomId: string; hostToken: string;
  onClose: () => void; onActivate: () => void; onDeactivate: () => void;
  streams?: MediaStream[];
}

const PLATFORMS = [
  {
    id: 'youtube', name: 'YouTube',
    base: 'rtmp://a.rtmp.youtube.com/live2/',
    placeholder: 'xxxx-xxxx-xxxx-xxxx',
    steps: ['Go to studio.youtube.com', 'Click Go Live → Streaming software', 'Copy your Stream key'],
  },
  {
    id: 'instagram', name: 'Instagram',
    base: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    placeholder: 'your-stream-key',
    steps: ['Open Instagram app', 'Tap + → Live → Settings', 'Enable third-party app → copy key'],
  },
  {
    id: 'custom', name: 'Custom RTMP',
    base: '',
    placeholder: 'rtmp://your-server/live/key',
    steps: [],
  },
];

type Status = 'idle' | 'connecting' | 'live' | 'error';

export default function RtmpModal({ roomId, hostToken, onClose, onActivate, onDeactivate, streams = [] }: RtmpModalProps) {
  const [platform, setPlatform] = useState<string | null>(null);
  const [key, setKey]           = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [status, setStatus]     = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null);
  const [bytesSent, setBytesSent] = useState(0);

  const mrRef    = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    fetch(`${API}/api/egress/ffmpeg-check`)
      .then(r => r.json())
      .then(d => setFfmpegOk(d.available))
      .catch(() => setFfmpegOk(false));
  }, []);

  const p = PLATFORMS.find(x => x.id === platform);
  const rtmpUrl = platform === 'custom' ? customUrl : `${p?.base || ''}${key}`;

  const flushChunks = async (port: number) => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    chunksRef.current = [];
    try {
      const res = await fetch(`${API}/api/egress/rtmp/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'video/webm', 'x-room-id': roomId, 'x-host-token': hostToken },
        body: blob,
      });
      if (res.ok) {
        const d = await res.json();
        setBytesSent(prev => prev + (d.bytes || 0));
      }
    } catch {}
  };

  const startStream = async () => {
    if (!rtmpUrl) { setErrorMsg('Enter a stream key'); return; }
    if (streams.length === 0) { setErrorMsg('Enable camera or screen first'); return; }
    setErrorMsg(''); setStatus('connecting');
    try {
      const res = await fetch(`${API}/api/egress/rtmp/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, rtmpUrl, platform }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus('error'); setErrorMsg(data.error || 'Failed'); return; }

      const combined = new MediaStream();
      streams.forEach(s => s.getTracks().forEach(t => combined.addTrack(t)));
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
      const mr = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_500_000 });
      mrRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.start(500);
      timerRef.current = setInterval(() => flushChunks(data.inputPort), 1000);

      setStatus('live');
      onActivate();
    } catch (e: any) {
      stopStream();
      setStatus('error');
      setErrorMsg(e.message || 'Failed');
    }
  };

  const stopStream = async () => {
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
    mrRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    chunksRef.current = [];
    try {
      await fetch(`${API}/api/egress/rtmp/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken }),
      });
    } catch {}
    setStatus('idle'); setKey(''); setPlatform(null); setBytesSent(0);
    onDeactivate();
  };

  useEffect(() => () => { stopStream(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-100 shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col"
        style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-sm text-gray-900">Stream to social media</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* FFmpeg status */}
          <div className={`text-xs px-3 py-2.5 rounded-lg border ${
            ffmpegOk === true  ? 'bg-green-50 border-green-100 text-green-600'
            : ffmpegOk === false ? 'bg-red-50 border-red-100 text-red-500'
            : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
            {ffmpegOk === true  && '✓ FFmpeg ready — your stream will go live on social media'}
            {ffmpegOk === false && (
              <div className="space-y-1">
                <p className="font-semibold">FFmpeg not found</p>
                <p>Install it first: <code className="bg-red-100 px-1 rounded">winget install ffmpeg</code></p>
              </div>
            )}
            {ffmpegOk === null && 'Checking FFmpeg...'}
          </div>

          {/* No stream warning */}
          {streams.length === 0 && (
            <div className="text-xs px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-600">
              Enable camera or screen in the studio first
            </div>
          )}

          {/* Live status */}
          {status === 'live' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-semibold text-green-700">Live on {p?.name}</span>
                </div>
                <span className="text-xs text-green-600">
                  {bytesSent > 1024 * 1024 ? `${(bytesSent / 1024 / 1024).toFixed(1)} MB` : `${(bytesSent / 1024).toFixed(0)} KB`} sent
                </span>
              </div>
              <button
                onClick={stopStream}
                className="w-full py-2.5 text-sm font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                Stop stream
              </button>
            </div>
          )}

          {status === 'connecting' && (
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin flex-shrink-0" />
              <p className="text-sm text-gray-600">Connecting to {p?.name}...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-red-600">Stream failed</p>
              <p className="text-xs text-red-500">{errorMsg}</p>
              <button onClick={() => { setStatus('idle'); setErrorMsg(''); }} className="text-xs text-gray-500 underline">
                Try again
              </button>
            </div>
          )}

          {/* Platform + form */}
          {(status === 'idle' || status === 'error') && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Platform</p>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => { setPlatform(pl.id); setKey(''); setErrorMsg(''); }}
                      className={`py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                        platform === pl.id
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-gray-50 text-gray-600 border-gray-100 hover:border-gray-300'}`}
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {platform && p && (
                  <motion.div
                    key={platform}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Steps */}
                    {p.steps.length > 0 && (
                      <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-gray-500 mb-2">How to get your stream key</p>
                        {p.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                            <span className="text-gray-300 font-semibold flex-shrink-0">{i + 1}.</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Key input */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                        {platform === 'custom' ? 'Full RTMP URL' : 'Stream key'}
                      </label>
                      <input
                        type={platform === 'custom' ? 'text' : 'password'}
                        value={platform === 'custom' ? customUrl : key}
                        onChange={e => platform === 'custom' ? setCustomUrl(e.target.value) : setKey(e.target.value)}
                        placeholder={p.placeholder}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors placeholder-gray-300 font-mono text-gray-900"
                      />
                    </div>

                    <button
                      onClick={startStream}
                      disabled={!ffmpegOk || (platform !== 'custom' && !key.trim()) || (platform === 'custom' && !customUrl.trim())}
                      className="w-full py-3 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Go live on {p.name}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          <p className="text-xs text-gray-300 text-center">Stream key is never stored permanently</p>
        </div>
      </motion.div>
    </div>
  );
}
