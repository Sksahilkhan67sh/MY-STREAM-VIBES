'use client';
/**
 * client/src/components/ModerationPanel.tsx
 * Features 5 & 6: Viewer Moderation Tools + Chat Filtering
 *
 * Host-only panel with:
 * - Ban / timeout / warn / unban viewers
 * - Live viewer list with actions
 * - Chat word filter management
 * - Moderation log
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Ban, Clock, AlertTriangle, Unlock, Filter,
  Plus, Trash2, X, ChevronRight, Users, History,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ModerationLog {
  id: string;
  viewerId: string;
  nickname: string;
  action: string;
  reason?: string;
  duration?: number;
  createdAt: string;
}

interface ChatFilter {
  id: string;
  keyword: string;
  action: string;
  replace?: string;
  isActive: boolean;
}

interface ModerationPanelProps {
  roomId: string;
  hostToken: string;
  userId: string;
  viewers?: { id: string; nickname: string }[];
  onClose?: () => void;
}

const QUICK_BAN_REASONS = ['Spam', 'Harassment', 'Hate speech', 'Inappropriate content', 'Bot/spam'];
const TIMEOUT_DURATIONS = [{ label: '1 min', sec: 60 }, { label: '5 min', sec: 300 }, { label: '10 min', sec: 600 }, { label: '30 min', sec: 1800 }];
const FILTER_ACTIONS = [
  { value: 'block', label: 'Block message', icon: '🚫' },
  { value: 'replace', label: 'Replace with ***', icon: '✏️' },
  { value: 'flag', label: 'Flag for review', icon: '🚩' },
];

export default function ModerationPanel({ roomId, hostToken, userId, viewers = [], onClose }: ModerationPanelProps) {
  const [tab, setTab] = useState<'viewers' | 'filters' | 'log'>('viewers');
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [filters, setFilters] = useState<ChatFilter[]>([]);
  const [banned, setBanned] = useState<string[]>([]);
  const [actionTarget, setActionTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [actionType, setActionType] = useState<'ban' | 'timeout' | 'warn' | null>(null);
  const [reason, setReason] = useState('');
  const [timeoutDur, setTimeoutDur] = useState(300);
  const [doing, setDoing] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newAction, setNewAction] = useState('block');
  const [newReplace, setNewReplace] = useState('');
  const [addingFilter, setAddingFilter] = useState(false);

  const loadModData = useCallback(async () => {
    const [logsRes, filtersRes, bannedRes] = await Promise.allSettled([
      fetch(`${API}/api/moderation/${roomId}/logs`),
      fetch(`${API}/api/moderation/filters/${userId}`),
      fetch(`${API}/api/moderation/${roomId}/banned`),
    ]);
    if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
      const d = await logsRes.value.json();
      setLogs(d.logs || []);
    }
    if (filtersRes.status === 'fulfilled' && filtersRes.value.ok) {
      const d = await filtersRes.value.json();
      setFilters(d.filters || []);
    }
    if (bannedRes.status === 'fulfilled' && bannedRes.value.ok) {
      const d = await bannedRes.value.json();
      setBanned(d.banned || []);
    }
  }, [roomId, userId]);

  useEffect(() => { loadModData(); }, [loadModData]);

  const doAction = async () => {
    if (!actionTarget || !actionType) return;
    setDoing(true);
    try {
      await fetch(`${API}/api/moderation/${roomId}/${actionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostToken,
          viewerId: actionTarget.id,
          nickname: actionTarget.nickname,
          reason: reason || undefined,
          duration: actionType === 'timeout' ? timeoutDur : undefined,
        }),
      });
      if (actionType === 'ban') setBanned(prev => [...prev, actionTarget.id]);
      await loadModData();
      setActionTarget(null);
      setActionType(null);
      setReason('');
    } catch { } finally { setDoing(false); }
  };

  const unban = async (viewerId: string, nickname: string) => {
    await fetch(`${API}/api/moderation/${roomId}/unban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken, viewerId, nickname }),
    });
    setBanned(prev => prev.filter(id => id !== viewerId));
    await loadModData();
  };

  const addFilter = async () => {
    if (!newKeyword.trim()) return;
    setAddingFilter(true);
    try {
      const res = await fetch(`${API}/api/moderation/filters/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newKeyword.trim(), action: newAction, replace: newAction === 'replace' ? newReplace : undefined }),
      });
      if (res.ok) {
        const d = await res.json();
        setFilters(prev => [d.filter, ...prev]);
        setNewKeyword('');
        setNewReplace('');
      }
    } catch { } finally { setAddingFilter(false); }
  };

  const removeFilter = async (filterId: string) => {
    await fetch(`${API}/api/moderation/filters/${filterId}`, { method: 'DELETE' });
    setFilters(prev => prev.filter(f => f.id !== filterId));
  };

  const actionColor = { ban: 'red', timeout: 'yellow', warn: 'orange' } as const;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#ff3520]" />
          <span className="text-white font-semibold text-sm">Moderation</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {([['viewers', 'Viewers', <Users className="w-3 h-3" />],
           ['filters', 'Chat Filters', <Filter className="w-3 h-3" />],
           ['log', 'Log', <History className="w-3 h-3" />]] as const).map(([t, label, icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold transition-colors
              ${tab === t ? 'text-white border-b-2 border-[#ff3520]' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* Viewers tab */}
        {tab === 'viewers' && (
          <div className="p-4 flex flex-col gap-2">
            {viewers.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-sm">No viewers connected</div>
            ) : (
              viewers.map(v => {
                const isBanned = banned.includes(v.id);
                return (
                  <div key={v.id} className={`flex items-center justify-between p-3 rounded-xl border ${isBanned ? 'border-red-500/20 bg-red-500/5' : 'border-white/10 bg-white/3'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isBanned ? 'bg-red-500' : 'bg-green-500'}`} />
                      <span className={`text-sm font-medium ${isBanned ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>{v.nickname}</span>
                      {isBanned && <span className="text-red-400 text-xs">(banned)</span>}
                    </div>
                    <div className="flex gap-1">
                      {isBanned ? (
                        <button
                          onClick={() => unban(v.id, v.nickname)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 text-green-400 text-xs hover:bg-green-500/20 transition-colors"
                        >
                          <Unlock className="w-3 h-3" /> Unban
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => { setActionTarget(v); setActionType('warn'); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                            title="Warn"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setActionTarget(v); setActionType('timeout'); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                            title="Timeout"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setActionTarget(v); setActionType('ban'); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Ban"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Chat Filters tab */}
        {tab === 'filters' && (
          <div className="p-4 flex flex-col gap-4">
            {/* Add new filter */}
            <div className="bg-white/3 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-white text-xs font-semibold uppercase tracking-wider">Add Filter</p>
              <input
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFilter()}
                placeholder="Keyword or phrase…"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#ff3520]/50"
              />
              <div className="flex gap-2">
                {FILTER_ACTIONS.map(fa => (
                  <button
                    key={fa.value}
                    onClick={() => setNewAction(fa.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${newAction === fa.value ? 'bg-[#ff3520]/20 border border-[#ff3520]/40 text-white' : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {fa.icon} {fa.label.split(' ')[0]}
                  </button>
                ))}
              </div>
              {newAction === 'replace' && (
                <input
                  value={newReplace}
                  onChange={e => setNewReplace(e.target.value)}
                  placeholder="Replace with… (leave empty for ***)"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#ff3520]/50"
                />
              )}
              <button
                onClick={addFilter}
                disabled={addingFilter || !newKeyword.trim()}
                className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#ff3520] text-white text-sm font-semibold hover:bg-[#e02e1a] disabled:opacity-40 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Filter
              </button>
            </div>

            {/* Filter list */}
            {filters.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-4">No filters yet</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filters.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-white/3 border border-white/10 rounded-xl">
                    <div>
                      <p className="text-white text-sm font-mono font-semibold">{f.keyword}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {FILTER_ACTIONS.find(a => a.value === f.action)?.label}
                        {f.replace && ` → "${f.replace}"`}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFilter(f.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Log tab */}
        {tab === 'log' && (
          <div className="p-4 flex flex-col gap-1.5">
            {logs.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center py-8">No moderation actions yet</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-white/3 border border-white/10 rounded-xl">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
                    ${log.action === 'ban' ? 'bg-red-500/20 text-red-400' :
                      log.action === 'timeout' ? 'bg-orange-500/20 text-orange-400' :
                      log.action === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-green-500/20 text-green-400'}`}
                  >
                    {log.action === 'ban' ? <Ban className="w-3 h-3" /> :
                     log.action === 'timeout' ? <Clock className="w-3 h-3" /> :
                     log.action === 'warn' ? <AlertTriangle className="w-3 h-3" /> :
                     <Unlock className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold">
                      {log.action.charAt(0).toUpperCase() + log.action.slice(1)}: <span className="text-zinc-300">{log.nickname}</span>
                    </p>
                    {log.reason && <p className="text-zinc-500 text-xs">{log.reason}</p>}
                    {log.duration && <p className="text-zinc-600 text-xs">{log.duration}s timeout</p>}
                    <p className="text-zinc-700 text-xs mt-0.5">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Action confirmation modal */}
      <AnimatePresence>
        {actionTarget && actionType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 flex items-end z-10"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full bg-[#111] border-t border-white/10 p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-white font-semibold text-sm">
                  {actionType === 'ban' ? '🚫 Ban' : actionType === 'timeout' ? '⏰ Timeout' : '⚠️ Warn'}{' '}
                  <span className="text-zinc-400">{actionTarget.nickname}</span>
                </p>
                <button onClick={() => { setActionTarget(null); setActionType(null); }} className="text-zinc-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {actionType === 'timeout' && (
                <div className="flex gap-2">
                  {TIMEOUT_DURATIONS.map(d => (
                    <button
                      key={d.sec}
                      onClick={() => setTimeoutDur(d.sec)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors
                        ${timeoutDur === d.sec ? 'bg-orange-500/20 border border-orange-500/40 text-orange-300' : 'bg-white/5 border border-white/10 text-zinc-400'}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-1.5 flex-wrap">
                {QUICK_BAN_REASONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-2 py-1 rounded-lg text-xs transition-colors
                      ${reason === r ? 'bg-[#ff3520]/20 border border-[#ff3520]/40 text-white' : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Custom reason (optional)"
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none"
              />

              <button
                onClick={doAction}
                disabled={doing}
                className={`py-3 rounded-xl font-semibold text-white transition-colors disabled:opacity-50
                  ${actionType === 'ban' ? 'bg-red-500 hover:bg-red-600' :
                    actionType === 'timeout' ? 'bg-orange-500 hover:bg-orange-600' :
                    'bg-yellow-500 hover:bg-yellow-600'}`}
              >
                {doing ? 'Processing…' : `Confirm ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
