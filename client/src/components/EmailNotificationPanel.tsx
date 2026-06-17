'use client';
/**
 * client/src/components/EmailNotificationPanel.tsx
 * Feature 3: Email Notifications
 *
 * Host panel to send email notifications to viewers.
 * - Send "Stream Starting" blast
 * - Send scheduled stream reminders
 * - View notification history
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, Send, Clock, CheckCircle, XCircle, Plus, X, Bell } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Notification {
  id: string;
  type: string;
  to: string;
  subject: string;
  status: string;
  sentAt?: string;
  createdAt: string;
}

interface EmailNotificationPanelProps {
  roomId: string;
  hostToken: string;
  streamTitle: string;
  scheduledAt?: string;
  onClose?: () => void;
}

const NOTIFICATION_TYPES = [
  { value: 'stream_start', label: 'Stream is Live!', icon: '🔴', desc: 'Notify viewers that your stream started' },
  { value: 'scheduled_reminder', label: 'Reminder', icon: '⏰', desc: 'Send a reminder before a scheduled stream' },
  { value: 'stream_end', label: 'Stream Ended', icon: '🏁', desc: 'Notify when stream ends with replay link' },
  { value: 'clip_ready', label: 'Clip Ready', icon: '✂️', desc: 'Notify when a clip is ready to share' },
  { value: 'summary_ready', label: 'Summary Ready', icon: '🤖', desc: 'Share the AI-generated summary' },
];

export default function EmailNotificationPanel({
  roomId, hostToken, streamTitle, scheduledAt, onClose,
}: EmailNotificationPanelProps) {
  const [type, setType] = useState('stream_start');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Notification[]>([]);
  const [tab, setTab] = useState<'send' | 'history'>('send');

  useEffect(() => {
    if (tab === 'history') {
      fetch(`${API}/api/notifications/stream/${roomId}`)
        .then(r => r.ok ? r.json() : { notifications: [] })
        .then(d => setHistory(d.notifications || []))
        .catch(() => {});
    }
  }, [tab, roomId]);

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError('Invalid email address');
      return;
    }
    if (emails.includes(email)) { setError('Already added'); return; }
    setEmails(prev => [...prev, email]);
    setEmailInput('');
    setError('');
  };

  const handleSend = async () => {
    if (emails.length === 0) { setError('Add at least one email'); return; }
    setSending(true);
    setError('');
    try {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const endpoint = emails.length === 1 ? '/api/notifications/send' : '/api/notifications/bulk';
      const body = emails.length === 1
        ? {
            hostToken, roomId, type,
            to: emails[0],
            data: {
              url: `${APP_URL}/s/${roomId}`,
              unsubLink: `${APP_URL}/unsubscribe`,
              scheduledAt: scheduledAt ? new Date(scheduledAt).toLocaleString() : '',
              timeUntil: scheduledAt ? getTimeUntil(scheduledAt) : '',
              duration: '',
              replayUrl: '',
            },
          }
        : {
            hostToken, roomId, type,
            emails,
            data: {
              url: `${APP_URL}/s/${roomId}`,
              unsubLink: `${APP_URL}/unsubscribe`,
              scheduledAt: scheduledAt ? new Date(scheduledAt).toLocaleString() : '',
              timeUntil: scheduledAt ? getTimeUntil(scheduledAt) : '',
              duration: '',
              replayUrl: '',
            },
          };

      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Send failed');
      setSent(true);
      setEmails([]);
      setTimeout(() => setSent(false), 3000);
    } catch {
      setError('Failed to send. Check server connection.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#ff3520]" />
          <span className="text-white font-semibold text-sm">Email Notifications</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {(['send', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors
              ${tab === t ? 'text-white border-b-2 border-[#ff3520]' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t === 'send' ? 'Send' : 'History'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'send' ? (
          <div className="p-4 flex flex-col gap-4">
            {/* Type selector */}
            <div>
              <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                Notification Type
              </label>
              <div className="flex flex-col gap-1.5">
                {NOTIFICATION_TYPES.map(nt => (
                  <button
                    key={nt.value}
                    onClick={() => setType(nt.value)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                      ${type === nt.value
                        ? 'border-[#ff3520]/60 bg-[#ff3520]/10'
                        : 'border-white/10 hover:border-white/20 bg-white/3'}`}
                  >
                    <span className="text-lg">{nt.icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${type === nt.value ? 'text-white' : 'text-zinc-300'}`}>{nt.label}</p>
                      <p className="text-zinc-600 text-xs">{nt.desc}</p>
                    </div>
                    {type === nt.value && <div className="ml-auto w-2 h-2 rounded-full bg-[#ff3520]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Email input */}
            <div>
              <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                Recipients
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addEmail()}
                  placeholder="viewer@email.com"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#ff3520]/50"
                />
                <button
                  onClick={addEmail}
                  className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-zinc-300 hover:bg-white/20 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {emails.map(e => (
                    <span key={e} className="flex items-center gap-1 bg-white/10 text-zinc-300 text-xs px-2 py-1 rounded-full">
                      {e}
                      <button onClick={() => setEmails(prev => prev.filter(x => x !== e))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={handleSend}
              disabled={sending || emails.length === 0}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40
                ${sent ? 'bg-green-500 text-white' : 'bg-[#ff3520] text-white hover:bg-[#e02e1a]'}`}
            >
              {sending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
               : sent ? <CheckCircle className="w-4 h-4" />
               : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : sent ? `Sent to ${emails.length} recipient${emails.length !== 1 ? 's' : ''}!` : `Send to ${emails.length} recipient${emails.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-2">
            {history.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-sm">No notifications sent yet</div>
            ) : (
              history.map(n => (
                <div key={n.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{n.subject}</p>
                      <p className="text-zinc-500 text-xs truncate">{n.to}</p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                      ${n.status === 'sent' ? 'bg-green-500/20 text-green-400' : n.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {n.status === 'sent' ? <CheckCircle className="w-3 h-3" /> : n.status === 'failed' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {n.status}
                    </span>
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {n.sentAt ? new Date(n.sentAt).toLocaleString() : new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getTimeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
