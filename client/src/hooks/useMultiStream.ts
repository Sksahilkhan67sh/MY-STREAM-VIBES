/**
 * client/src/hooks/useMultiStream.ts
 * PHASE 5 — Multi-Platform Streaming Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface RtmpDestination {
  id: string;
  platform: 'youtube' | 'twitch' | 'facebook' | 'linkedin' | 'custom';
  label: string;
  streamKey: string;
  isEnabled: boolean;
  totalStreams: number;
  totalMinutes: number;
  lastUsedAt: string | null;
}

export interface SessionHealth {
  sessionId: string;
  destinationId: string;
  platform: string;
  label: string;
  status: 'idle' | 'connecting' | 'live' | 'error' | 'stopped';
  bitrateKbps: number;
  droppedFrames: number;
  health: 'good' | 'degraded' | 'poor' | 'unknown';
  uptimeSeconds: number;
  startedAt: string | null;
  errorMessage: string | null;
}

export interface PlatformConfig {
  name: string;
  rtmpBase: string;
  keyPlaceholder: string;
  maxBitrateKbps: number;
  recommendedBitrateKbps: number;
  color: string;
  icon: string;
}

export function useMultiStream(roomId: string, hostToken: string) {
  const [destinations, setDestinations] = useState<RtmpDestination[]>([]);
  const [platforms, setPlatforms] = useState<Record<string, PlatformConfig>>({});
  const [health, setHealth] = useState<SessionHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDestinationIds, setActiveDestinationIds] = useState<Set<string>>(new Set());

  const healthPollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch supported platforms ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/multistream/platforms`)
      .then(r => r.json())
      .then(d => setPlatforms(d.platforms))
      .catch(() => {});
  }, []);

  // ── Fetch saved destinations ──────────────────────────────────────────────
  const fetchDestinations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/multistream/destinations`, {
        headers: { 'x-user-id': '' }, // will be filled by Next.js server action proxy
      });
      const data = await res.json();
      setDestinations(data.destinations ?? []);
    } catch {
      setError('Failed to load destinations');
    }
  }, []);

  useEffect(() => { fetchDestinations(); }, [fetchDestinations]);

  // ── Health polling (every 10s when there are active sessions) ────────────
  const pollHealth = useCallback(async () => {
    if (activeDestinationIds.size === 0) return;
    try {
      const res = await fetch(`${API}/api/multistream/health/${roomId}`);
      const data = await res.json();
      setHealth(data.sessions ?? []);
    } catch {}
  }, [roomId, activeDestinationIds]);

  useEffect(() => {
    if (activeDestinationIds.size > 0) {
      healthPollRef.current = setInterval(pollHealth, 10_000);
    } else {
      if (healthPollRef.current) clearInterval(healthPollRef.current);
    }
    return () => { if (healthPollRef.current) clearInterval(healthPollRef.current); };
  }, [activeDestinationIds, pollHealth]);

  // ── Create destination ────────────────────────────────────────────────────
  const createDestination = useCallback(async (params: {
    platform: string;
    label: string;
    streamKey: string;
    customRtmpBase?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/multistream/destinations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchDestinations();
      return data.destination;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [fetchDestinations]);

  // ── Delete destination ────────────────────────────────────────────────────
  const deleteDestination = useCallback(async (id: string) => {
    await fetch(`${API}/api/multistream/destinations/${id}`, { method: 'DELETE' });
    setDestinations(prev => prev.filter(d => d.id !== id));
  }, []);

  // ── Toggle destination enabled ────────────────────────────────────────────
  const toggleDestination = useCallback(async (id: string, isEnabled: boolean) => {
    await fetch(`${API}/api/multistream/destinations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled }),
    });
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, isEnabled } : d));
  }, []);

  // ── Start multi-stream ────────────────────────────────────────────────────
  const startMultiStream = useCallback(async (
    destinationIds: string[],
    sourceRtmpUrl: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/multistream/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, destinationIds, sourceRtmpUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const successful = data.results
        .filter((r: { ok: boolean }) => r.ok)
        .map((r: { destinationId: string }) => r.destinationId);
      setActiveDestinationIds(new Set(successful));
      await pollHealth();
      return data.results;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [roomId, hostToken, pollHealth]);

  // ── Stop multi-stream ─────────────────────────────────────────────────────
  const stopMultiStream = useCallback(async (destinationIds?: string[]) => {
    setLoading(true);
    try {
      await fetch(`${API}/api/multistream/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, destinationIds }),
      });
      if (destinationIds) {
        setActiveDestinationIds(prev => {
          const next = new Set(prev);
          destinationIds.forEach(id => next.delete(id));
          return next;
        });
      } else {
        setActiveDestinationIds(new Set());
      }
      setHealth([]);
    } finally {
      setLoading(false);
    }
  }, [roomId, hostToken]);

  return {
    destinations,
    platforms,
    health,
    loading,
    error,
    activeDestinationIds,
    createDestination,
    deleteDestination,
    toggleDestination,
    startMultiStream,
    stopMultiStream,
    refetch: fetchDestinations,
  };
}
