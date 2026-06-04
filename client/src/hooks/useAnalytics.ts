/**
 * useAnalytics
 * Drop-in hook for viewer pages. Tracks join/leave/watch-time automatically.
 * Call trackEvent() for manual events (chat, reaction, poll_vote).
 */

'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Fingerprint ─────────────────────────────────────────────────────────────

function getViewerId(): string {
  const key = 'sv_viewer_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

function getSessionId(): string {
  const key = 'sv_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function getBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Other';
}

function getOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Other';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseAnalyticsOptions {
  roomId: string;
  userId?: string;
  enabled?: boolean;
}

export function useAnalytics({ roomId, userId, enabled = true }: UseAnalyticsOptions) {
  const joinTimeRef = useRef<number>(Date.now());
  const viewerId    = useRef<string>('');
  const sessionId   = useRef<string>('');

  const send = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      if (!enabled || !roomId) return;
      // Use sendBeacon for leave events (survives page close)
      const payload = JSON.stringify({
        event,
        viewerId:  viewerId.current,
        sessionId: sessionId.current,
        userId,
        deviceType: getDeviceType(),
        browser:    getBrowser(),
        os:         getOS(),
        ...extra,
      });

      if (event === 'leave' && navigator.sendBeacon) {
        navigator.sendBeacon(`${API}/api/analytics/${roomId}/track`, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(`${API}/api/analytics/${roomId}/track`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    payload,
          keepalive: true,
        }).catch(() => {});
      }
    },
    [roomId, userId, enabled]
  );

  const trackEvent = useCallback(
    (event: 'chat' | 'poll_vote' | 'reaction' | 'donate') => {
      send(event);
    },
    [send]
  );

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    viewerId.current  = getViewerId();
    sessionId.current = getSessionId();
    joinTimeRef.current = Date.now();

    // Track join
    send('join');

    // Track leave on unmount / page hide
    const handleLeave = () => {
      const watchSeconds = Math.round((Date.now() - joinTimeRef.current) / 1000);
      send('leave', { watchSeconds });
    };

    window.addEventListener('beforeunload', handleLeave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleLeave();
    });

    return () => {
      handleLeave();
      window.removeEventListener('beforeunload', handleLeave);
    };
  }, [roomId, enabled]); // eslint-disable-line

  return { trackEvent };
}

// ─── Live stats polling hook (for host dashboard panel) ────────────────────────

export interface LiveStats {
  concurrent:    number;
  uniqueViewers: number;
  peak:          number;
  chat:          number;
  timeline:      { ts: string; count: number }[];
}

export function useLiveStats(roomId: string, hostToken: string, intervalMs = 5000) {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    if (!roomId || !hostToken) return;

    const fetchStats = () =>
      fetch(`${API}/api/analytics/${roomId}/live?hostToken=${encodeURIComponent(hostToken)}`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});

    fetchStats();
    const id = setInterval(fetchStats, intervalMs);
    return () => clearInterval(id);
  }, [roomId, hostToken, intervalMs]);

  return stats;
}
