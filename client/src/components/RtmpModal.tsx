'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Youtube, Instagram, Radio, Copy, Check, ExternalLink, AlertCircle } from 'lucide-react';

interface RtmpModalProps {
  roomId: string;
  hostToken: string;
  onClose: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}

const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube Live',
    icon: Youtube,
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/30',
    activeBg: 'bg-red-500/20 border-red-500/50',
    rtmpBase: 'rtmp://a.rtmp.youtube.com/live2/',
    keyPlaceholder: 'xxxx-xxxx-xxxx-xxxx-xxxx',
    helpUrl: 'https://studio.youtube.com',
    helpText: 'Get stream key from YouTube Studio → Go Live → Stream',
    streamUrl: '',
  },
  {
    id: 'instagram',
    name: 'Instagram Live',
    icon: Instagram,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10 border-pink-500/30',
    activeBg: 'bg-pink-500/20 border-pink-500/50',
    rtmpBase: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    keyPlaceholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    helpUrl: 'https://www.instagram.com',
    helpText: 'Get stream key from Instagram app → Live → Advanced Settings',
    streamUrl: '',
  },
  {
    id: 'custom',
    name: 'Custom RTMP',
    icon: Radio,
    color: 'text-zinc-400',
    bg: 'bg-zinc-800/50 border-zinc-700',
    activeBg: 'bg-zinc-700/50 border-zinc-500',
    rtmpBase: '',
    keyPlaceholder: '',
    helpUrl: '',
    helpText: 'Enter any RTMP server URL and stream key',
    streamUrl: '',
  },
];

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function RtmpModal({ roomId, hostToken, onClose, onActivate, onDeactivate }: RtmpModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const platform = PLATFORMS.find(p => p.id === selected);

  const getRtmpUrl = () => {
    if (!platform) return '';
    if (platform.id === 'custom') return customUrl;
    return `${platform.rtmpBase}${streamKey}`;
  };

  const startRtmp = async () => {
    if (!streamKey.trim() && selected !== 'custom') {
      setError('Please enter your stream key');
      return;
    }
    if (selected === 'custom' && !customUrl.trim()) {
      setError('Please enter the RTMP URL');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/egress/rtmp/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          hostToken,
          rtmpUrl: getRtmpUrl(),
          platform: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start RTMP');
      setActive(selected);
      onActivate();
    } catch (e: any) {
      setError(e.message || 'Failed to start stream');
    } finally {
      setLoading(false);
    }
  };

  const stopRtmp = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/api/egress/rtmp/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, platform: active }),
      });
      setActive(null);
      onDeactivate();
      setStreamKey('');
      setSelected(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyRtmpUrl = () => {
    navigator.clipboard.writeText(getRtmpUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-brand-500" />
            <h2 className="font-bold text-sm">Go Live on Social Media</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Active stream banner */}
          {active && (
            <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="live-dot" />
                <span className="text-sm font-semibold text-green-400">
                  Live on {PLATFORMS.find(p => p.id === active)?.name}
                </span>
              </div>
              <button
                onClick={stopRtmp}
                disabled={loading}
                className="text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
              >
                Stop
              </button>
            </div>
          )}

          {/* Platform selector */}
          {!active && (
            <>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Select Platform</p>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map(p => {
                  const Icon = p.icon;
                  const isSelected = selected === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setSelected(p.id); setStreamKey(''); setError(''); }}
                      className={`flex flex-col items-center gap-2 py-3.5 rounded-xl border text-xs font-semibold transition-all
                        ${isSelected ? p.activeBg : p.bg} ${isSelected ? '' : 'hover:brightness-125'}`}
                    >
                      <Icon className={`w-5 h-5 ${p.color}`} />
                      <span className={isSelected ? 'text-zinc-200' : 'text-zinc-500'}>
                        {p.id === 'youtube' ? 'YouTube' : p.id === 'instagram' ? 'Instagram' : 'Custom'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Stream key input */}
              {selected && platform && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Help text */}
                  <div className="flex items-start gap-2 bg-zinc-800/60 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-400 leading-relaxed">{platform.helpText}</p>
                      {platform.helpUrl && (
                        <a href={platform.helpUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-1">
                          Open {platform.name} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Custom URL field */}
                  {selected === 'custom' && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">RTMP Server URL</label>
                      <input
                        value={customUrl}
                        onChange={e => setCustomUrl(e.target.value)}
                        placeholder="rtmp://a.rtmp.youtube.com/live2/your-key"
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
                      />
                    </div>
                  )}

                  {/* Stream key field */}
                  {selected !== 'custom' && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Stream Key</label>
                      <input
                        type="password"
                        value={streamKey}
                        onChange={e => setStreamKey(e.target.value)}
                        placeholder={platform.keyPlaceholder}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-brand-500 transition-colors"
                      />
                      <p className="text-xs text-zinc-600 mt-1.5">Your stream key is never stored — only used for this session.</p>
                    </div>
                  )}

                  {/* Preview RTMP URL */}
                  {(streamKey || customUrl) && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-zinc-500 font-semibold">RTMP Endpoint</p>
                        <button onClick={copyRtmpUrl} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
                          {copied ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-zinc-400 break-all">
                        {selected === 'custom' ? customUrl : `${platform.rtmpBase}${'•'.repeat(Math.min(streamKey.length, 12))}`}
                      </p>
                    </div>
                  )}

                  {error && (
                    <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      ⚠️ {error}
                    </p>
                  )}

                  <button
                    onClick={startRtmp}
                    disabled={loading || (!streamKey.trim() && selected !== 'custom') || (selected === 'custom' && !customUrl.trim())}
                    className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting...</>
                    ) : (
                      <><Radio className="w-4 h-4" /> Go Live on {platform.name}</>
                    )}
                  </button>
                </motion.div>
              )}
            </>
          )}

          {/* Info note */}
          <p className="text-xs text-zinc-600 text-center pt-1">
            Your StreamVault stream is forwarded via RTMP · Works while you're live
          </p>
        </div>
      </motion.div>
    </div>
  );
}
