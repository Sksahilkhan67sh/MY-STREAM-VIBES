'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, Clock, Radio, CheckCircle, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StreamSchedulerBannerProps {
  scheduledAt: string;
  roomId: string;
  title: string;
  onStreamLive?: () => void;
}

type NotifState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

function useCountdown(targetDate: string) {
  const getRemaining = () => {
    const diff = new Date(targetDate).getTime() - Date.now();
    if (diff <= 0) return null;
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { days, hours, minutes, seconds, totalMs: diff };
  };

  const [remaining, setRemaining] = useState(getRemaining);

  useEffect(() => {
    const interval = setInterval(() => {
      const r = getRemaining();
      setRemaining(r);
      if (!r) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return remaining;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

function scheduleLocalNotification(reg: ServiceWorkerRegistration, scheduledAt: string, roomId: string, title: string) {
  const msUntil = new Date(scheduledAt).getTime() - Date.now();
  const notifyAt = msUntil - 5 * 60 * 1000; // 5 min before

  if (notifyAt > 0 && reg.active) {
    reg.active.postMessage({
      type: 'SCHEDULE_NOTIFICATION',
      title: `🔴 ${title} starts in 5 minutes!`,
      body: 'Your stream is about to go live. Tap to watch now.',
      roomId,
      delay: notifyAt,
    });
  }

  // Also schedule an "it's live now" notification
  if (msUntil > 0 && reg.active) {
    reg.active.postMessage({
      type: 'SCHEDULE_NOTIFICATION',
      title: `🔴 ${title} is LIVE now!`,
      body: 'The stream has started. Tap to watch.',
      roomId,
      delay: msUntil,
    });
  }
}

export default function StreamSchedulerBanner({
  scheduledAt,
  roomId,
  title,
  onStreamLive,
}: StreamSchedulerBannerProps) {
  const remaining = useCountdown(scheduledAt);
  const [notifState, setNotifState] = useState<NotifState>('idle');
  const [dismissed, setDismissed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Check if browser supports notifications
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setNotifState('unsupported');
    } else if (Notification.permission === 'granted') {
      setNotifState('granted');
    } else if (Notification.permission === 'denied') {
      setNotifState('denied');
    }
  }, []);

  // Trigger onStreamLive when countdown ends
  useEffect(() => {
    if (!remaining && onStreamLive) {
      const timer = setTimeout(onStreamLive, 2000);
      return () => clearTimeout(timer);
    }
  }, [remaining, onStreamLive]);

  const requestNotification = useCallback(async () => {
    if (!('Notification' in window)) { setNotifState('unsupported'); return; }
    setNotifState('requesting');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotifState('granted');
        const reg = await registerServiceWorker();
        if (reg) {
          scheduleLocalNotification(reg, scheduledAt, roomId, title);
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 4000);
        }
      } else {
        setNotifState('denied');
      }
    } catch {
      setNotifState('denied');
    }
  }, [scheduledAt, roomId, title]);

  const sendEmailReminder = async () => {
    if (!email || !email.includes('@')) return;
    setEmailLoading(true);
    try {
      await fetch(`${API}/api/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, type: 'email', contact: email }),
      });
      setEmailSent(true);
      setShowEmailForm(false);
    } catch {
      // silently fail
    } finally {
      setEmailLoading(false);
    }
  };

  if (dismissed) return null;

  // Stream is starting / just started
  if (!remaining) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,53,32,0.15), rgba(200,20,5,0.08))',
          border: '1px solid rgba(255,53,32,0.3)',
        }}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-[#ff3520]" />
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-[#ff3520] animate-ping opacity-75" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-100">Stream is starting!</p>
            <p className="text-xs text-zinc-400 mt-0.5">Refresh to watch live</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="ml-auto px-4 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #ff3520, #c81405)' }}
          >
            Watch Now →
          </button>
        </div>
      </motion.div>
    );
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const isSoon = remaining.totalMs < 5 * 60 * 1000; // < 5 min

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="rounded-2xl overflow-hidden"
        style={{
          background: isSoon
            ? 'linear-gradient(135deg, rgba(255,53,32,0.12), rgba(200,20,5,0.06))'
            : 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
          border: isSoon
            ? '1px solid rgba(255,53,32,0.25)'
            : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Top bar */}
        <div
          className="flex items-center gap-2 px-5 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Scheduled Stream</span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Countdown */}
        <div className="px-5 py-5">
          <p className="text-base font-bold text-zinc-100 mb-4 truncate">{title}</p>

          <div className="flex items-end gap-3 mb-5">
            {remaining.days > 0 && (
              <div className="text-center">
                <div
                  className="text-3xl font-black tabular-nums leading-none mb-1"
                  style={{
                    fontFamily: "'DM Mono', 'Fira Code', monospace",
                    color: isSoon ? '#ff3520' : '#f4f4f5',
                  }}
                >
                  {pad(remaining.days)}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">days</div>
              </div>
            )}
            {remaining.days > 0 && <span className="text-2xl font-black text-zinc-700 mb-3">:</span>}

            <div className="text-center">
              <div
                className="text-3xl font-black tabular-nums leading-none mb-1"
                style={{
                  fontFamily: "'DM Mono', 'Fira Code', monospace",
                  color: isSoon ? '#ff3520' : '#f4f4f5',
                }}
              >
                {pad(remaining.hours)}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">hrs</div>
            </div>
            <span className="text-2xl font-black text-zinc-700 mb-3">:</span>
            <div className="text-center">
              <div
                className="text-3xl font-black tabular-nums leading-none mb-1"
                style={{
                  fontFamily: "'DM Mono', 'Fira Code', monospace",
                  color: isSoon ? '#ff3520' : '#f4f4f5',
                }}
              >
                {pad(remaining.minutes)}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">min</div>
            </div>
            <span className="text-2xl font-black text-zinc-700 mb-3">:</span>
            <div className="text-center">
              <div
                className="text-3xl font-black tabular-nums leading-none mb-1"
                style={{
                  fontFamily: "'DM Mono', 'Fira Code', monospace",
                  color: isSoon ? '#ff3520' : '#f4f4f5',
                }}
              >
                {pad(remaining.seconds)}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">sec</div>
            </div>
          </div>

          {/* Notification actions */}
          <div className="space-y-2">
            {notifState === 'idle' && (
              <button
                onClick={requestNotification}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'rgba(255,53,32,0.1)',
                  border: '1px solid rgba(255,53,32,0.2)',
                  color: '#ff3520',
                }}
              >
                <Bell className="w-4 h-4" />
                Notify me 5 min before
              </button>
            )}

            {notifState === 'requesting' && (
              <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)' }}>
                <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                Requesting permission…
              </div>
            )}

            {notifState === 'granted' && (
              <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                <CheckCircle className="w-4 h-4" />
                {showSuccess ? "You'll be notified before the stream!" : 'Browser notifications enabled'}
              </div>
            )}

            {(notifState === 'denied' || notifState === 'unsupported') && !emailSent && (
              <>
                {!showEmailForm ? (
                  <button
                    onClick={() => setShowEmailForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: 'rgba(255,53,32,0.1)', border: '1px solid rgba(255,53,32,0.2)', color: '#ff3520' }}
                  >
                    <Bell className="w-4 h-4" />
                    Email me before the stream
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setShowEmailForm(false)} className="flex-1 py-2 rounded-xl text-xs font-semibold text-zinc-500" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>Cancel</button>
                      <button
                        onClick={sendEmailReminder}
                        disabled={emailLoading || !email.includes('@')}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #ff3520, #c81405)', opacity: emailLoading ? 0.7 : 1 }}
                      >
                        {emailLoading ? 'Sending…' : 'Remind me'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}

            {emailSent && (
              <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}>
                <CheckCircle className="w-4 h-4" />
                Email reminder set! We&apos;ll notify you 5 min before.
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-600 text-center mt-3">
            {new Date(scheduledAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
