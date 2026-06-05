/**
 * client/src/components/MultiStreamPanel.tsx
 * PHASE 5 — Multi-Platform Streaming UI
 *
 * Drop-in replacement/addition to RtmpModal.tsx
 * Usage inside HostControls.tsx:
 *   <MultiStreamPanel roomId={stream.roomId} hostToken={stream.hostToken} />
 */

'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Radio, CheckCircle2, AlertCircle,
  Wifi, WifiOff, Activity, ChevronDown, ChevronUp,
  Youtube, Twitch, Facebook, Linkedin, Settings,
  Play, Square, BarChart2, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { useMultiStream, RtmpDestination, SessionHealth } from '../hooks/useMultiStream';

// ── Platform icons + colors ───────────────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  youtube:  { label: 'YouTube',  color: '#FF0000', bg: 'bg-red-500/10',    Icon: Youtube  },
  twitch:   { label: 'Twitch',   color: '#9147FF', bg: 'bg-violet-500/10', Icon: Twitch   },
  facebook: { label: 'Facebook', color: '#1877F2', bg: 'bg-blue-500/10',   Icon: Facebook },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', bg: 'bg-sky-500/10',    Icon: Linkedin },
  custom:   { label: 'Custom',   color: '#6B7280', bg: 'bg-gray-500/10',   Icon: Radio    },
};

// ── Health badge ──────────────────────────────────────────────────────────────
function HealthBadge({ health, status }: { health: string; status: string }) {
  if (status === 'connecting') return (
    <span className="flex items-center gap-1 text-xs text-yellow-500 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
      Connecting
    </span>
  );
  if (status === 'error') return (
    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
      <AlertCircle className="w-3 h-3" /> Error
    </span>
  );
  if (status !== 'live') return (
    <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Idle
    </span>
  );
  const map = {
    good:      { color: 'text-emerald-500', dot: 'bg-emerald-500', label: 'Good' },
    degraded:  { color: 'text-yellow-500',  dot: 'bg-yellow-500',  label: 'Degraded' },
    poor:      { color: 'text-red-500',     dot: 'bg-red-500',     label: 'Poor' },
    unknown:   { color: 'text-gray-400',    dot: 'bg-gray-400',    label: 'Monitoring' },
  };
  const m = map[health as keyof typeof map] ?? map.unknown;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${health === 'good' ? 'animate-pulse' : ''}`} />
      {m.label}
    </span>
  );
}

// ── Add Destination Modal ─────────────────────────────────────────────────────
function AddDestinationModal({
  platforms,
  onAdd,
  onClose,
}: {
  platforms: Record<string, { name: string; rtmpBase: string; keyPlaceholder: string; color: string }>;
  onAdd: (params: { platform: string; label: string; streamKey: string; customRtmpBase?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [platform, setPlatform] = useState('youtube');
  const [label, setLabel]       = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [customBase, setCustomBase] = useState('');
  const [showKey, setShowKey]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const platformKeys = Object.keys(platforms).filter(p => platforms[p]);
  const selectedMeta = PLATFORM_META[platform];

  const handleAdd = async () => {
    if (!label.trim()) { setErr('Enter a label for this destination'); return; }
    if (!streamKey.trim()) { setErr('Enter your stream key'); return; }
    if (platform === 'custom' && !customBase.trim()) { setErr('Enter the RTMP server URL'); return; }
    setSaving(true); setErr('');
    try {
      await onAdd({ platform, label: label.trim(), streamKey: streamKey.trim(), customRtmpBase: customBase || undefined });
      onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Streaming Destination</h3>
          <p className="text-sm text-gray-500 mt-0.5">Stream simultaneously to multiple platforms</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Platform selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Platform</label>
            <div className="grid grid-cols-3 gap-2">
              {platformKeys.map(p => {
                const meta = PLATFORM_META[p];
                if (!meta) return null;
                const { Icon } = meta;
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-medium transition-all
                      ${platform === p
                        ? 'border-gray-900 dark:border-white bg-gray-50 dark:bg-gray-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                  >
                    <Icon className="w-5 h-5" style={{ color: meta.color }} />
                    <span className="text-gray-700 dark:text-gray-300">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nickname</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={`e.g. My ${selectedMeta?.label} Channel`}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition"
            />
          </div>

          {/* Custom RTMP base */}
          {platform === 'custom' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">RTMP Server URL</label>
              <input
                value={customBase}
                onChange={e => setCustomBase(e.target.value)}
                placeholder="rtmp://your-server.com/live/"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition"
              />
            </div>
          )}

          {/* Stream key */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Stream Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={streamKey}
                onChange={e => setStreamKey(e.target.value)}
                placeholder={platforms[platform]?.keyPlaceholder ?? 'your-stream-key'}
                className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Stored encrypted. Never shared.</p>
          </div>

          {err && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add Destination'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Destination Card ──────────────────────────────────────────────────────────
function DestinationCard({
  dest,
  health,
  isActive,
  isSelected,
  onSelect,
  onDelete,
  onToggle,
}: {
  dest: RtmpDestination;
  health?: SessionHealth;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const meta = PLATFORM_META[dest.platform] ?? PLATFORM_META.custom;
  const { Icon } = meta;

  return (
    <div className={`relative rounded-xl border-2 transition-all overflow-hidden
      ${isSelected
        ? 'border-gray-900 dark:border-white'
        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>

      {/* Active indicator */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Select checkbox */}
          <button
            onClick={() => onSelect(dest.id, !isSelected)}
            className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition
              ${isSelected
                ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                : 'border-gray-300 dark:border-gray-600'}`}
          >
            {isSelected && <CheckCircle2 className="w-3 h-3 text-white dark:text-gray-900" />}
          </button>

          {/* Platform icon */}
          <div className={`w-9 h-9 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5" style={{ color: meta.color }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{dest.label}</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggle(dest.id, !dest.isEnabled)}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium transition
                    ${dest.isEnabled
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                >
                  {dest.isEnabled ? 'On' : 'Off'}
                </button>
                <button
                  onClick={() => onDelete(dest.id)}
                  className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{meta.label} · {dest.totalStreams} stream{dest.totalStreams !== 1 ? 's' : ''}</p>

            {/* Health when active */}
            {health && isActive && (
              <div className="mt-2 flex items-center gap-3">
                <HealthBadge health={health.health} status={health.status} />
                {health.status === 'live' && (
                  <>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> {health.bitrateKbps} kbps
                    </span>
                    <span className="text-xs text-gray-500">
                      {Math.floor(health.uptimeSeconds / 60)}m {health.uptimeSeconds % 60}s
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function MultiStreamPanel({
  roomId,
  hostToken,
  sourceRtmpUrl,
  onClose,
}: {
  roomId: string;
  hostToken: string;
  sourceRtmpUrl?: string;
  onClose: () => void;
}) {
  const {
    destinations, platforms, health, loading, error,
    activeDestinationIds,
    createDestination, deleteDestination, toggleDestination,
    startMultiStream, stopMultiStream, refetch,
  } = useMultiStream(roomId, hostToken);

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [showHealth, setShowHealth]     = useState(true);
  const [starting, setStarting]         = useState(false);
  const [startError, setStartError]     = useState('');

  // Auto-select all enabled destinations by default
  useEffect(() => {
    setSelectedIds(new Set(destinations.filter(d => d.isEnabled).map(d => d.id)));
  }, [destinations]);

  const toggleSelect = (id: string, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      selected ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleStart = async () => {
    if (!sourceRtmpUrl) { setStartError('No source stream URL available. Start your camera stream first.'); return; }
    if (selectedIds.size === 0) { setStartError('Select at least one destination'); return; }
    setStarting(true); setStartError('');
    try {
      const results = await startMultiStream(Array.from(selectedIds), sourceRtmpUrl);
      const failed = results.filter((r: { ok: boolean }) => !r.ok);
      if (failed.length > 0) setStartError(`${failed.length} destination(s) failed to start`);
    } catch (e) { setStartError((e as Error).message); }
    finally { setStarting(false); }
  };

  const handleStop = async () => {
    await stopMultiStream();
  };

  const isStreaming = activeDestinationIds.size > 0;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Radio className="w-4 h-4" />
              Multistream
              {isStreaming && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE to {activeDestinationIds.size}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Stream to multiple platforms simultaneously</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refetch} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {destinations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <Radio className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No destinations yet</p>
              <p className="text-xs text-gray-500 mt-1">Add YouTube, Twitch, Facebook, or a custom RTMP endpoint</p>
            </div>
          ) : (
            <>
              {/* Health summary when streaming */}
              {isStreaming && health.length > 0 && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    onClick={() => setShowHealth(!showHealth)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    <span className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" />
                      Stream Health
                    </span>
                    {showHealth ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <AnimatePresence>
                    {showHealth && (
                      <motion.div
                        initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                        className="overflow-hidden border-t border-gray-200 dark:border-gray-700"
                      >
                        <div className="px-4 py-3 space-y-2">
                          {health.map(h => {
                            const meta = PLATFORM_META[h.platform] ?? PLATFORM_META.custom;
                            const { Icon } = meta;
                            return (
                              <div key={h.destinationId} className="flex items-center gap-3">
                                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: meta.color }} />
                                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{h.label}</span>
                                <HealthBadge health={h.health} status={h.status} />
                                {h.status === 'live' && (
                                  <span className="text-xs text-gray-500">{h.bitrateKbps}k</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Destination list */}
              <div className="space-y-2">
                {destinations.map(dest => (
                  <DestinationCard
                    key={dest.id}
                    dest={dest}
                    health={health.find(h => h.destinationId === dest.id)}
                    isActive={activeDestinationIds.has(dest.id)}
                    isSelected={selectedIds.has(dest.id)}
                    onSelect={toggleSelect}
                    onDelete={deleteDestination}
                    onToggle={toggleDestination}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
          >
            <Plus className="w-4 h-4" /> Add Destination
          </button>

          {startError && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {startError}
            </div>
          )}

          {isStreaming ? (
            <button
              onClick={handleStop}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition disabled:opacity-50"
            >
              <Square className="w-4 h-4" />
              Stop All Streams
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={starting || selectedIds.size === 0 || destinations.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition disabled:opacity-40"
            >
              {starting ? (
                <><span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> Starting…</>
              ) : (
                <><Play className="w-4 h-4" /> Start Multistream ({selectedIds.size})</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Add destination modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddDestinationModal
            platforms={platforms}
            onAdd={createDestination}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
