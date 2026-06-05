'use client';
import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface PlanFeatures {
  maxStreamsPerMonth:   number;
  maxViewersPerStream: number;
  maxStreamDuration:   number;
  maxStorageGB:        number;
  maxCoHosts:          number;
  canRecord:           boolean;
  canGoRTMP:           boolean;
  canRunPolls:         boolean;
  canAccessAnalytics:  boolean;
  canAcceptDonations:  boolean;
  canCustomBranding:   boolean;
  canScheduleStreams:  boolean;
  hasAIFeatures:       boolean;
  hasPrioritySupport:  boolean;
  hasWhiteLabel:       boolean;
}

export interface SubscriptionState {
  planName:          string;
  displayName:       string;
  status:            string;
  billingCycle:      string;
  currentPeriodEnd:  string | null;
  cancelAtPeriodEnd: boolean;
  features:          PlanFeatures;
  usage: {
    streamsUsed:    number;
    storageUsedGB:  number;
    streamMinutes:  number;
  };
  isActive: boolean;
}

export function useSubscription(userId: string, hostToken: string) {
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  const load = useCallback(async () => {
    if (!userId || !hostToken) { setLoading(false); return; }
    try {
      const res = await fetch(
        `${API}/api/subscriptions/me?userId=${userId}&hostToken=${encodeURIComponent(hostToken)}`
      );
      if (!res.ok) throw new Error('Failed to load');
      setSubscription(await res.json());
    } catch (e) {
      setError('Could not load subscription');
    } finally {
      setLoading(false);
    }
  }, [userId, hostToken]);

  useEffect(() => { load(); }, [load]);

  const can = useCallback(
    (feature: keyof PlanFeatures): boolean => {
      if (!subscription) return false;
      const val = subscription.features[feature];
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number')  return val !== 0;
      return false;
    },
    [subscription]
  );

  const isAtLimit = useCallback(
    (resource: 'streams'): boolean => {
      if (!subscription) return true;
      if (resource === 'streams') {
        const max = subscription.features.maxStreamsPerMonth;
        return max !== -1 && subscription.usage.streamsUsed >= max;
      }
      return false;
    },
    [subscription]
  );

  return { subscription, loading, error, can, isAtLimit, reload: load };
}
