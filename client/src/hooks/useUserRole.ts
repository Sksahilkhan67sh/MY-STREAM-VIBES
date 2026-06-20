'use client';
// client/src/hooks/useUserRole.ts
//
// Fetches the authenticated user's role (VIEWER | CREATOR | ADMIN) from the
// server. Role lives in Postgres, not in the JWT session, so this hook talks
// to /api/users/:id/role on mount and caches in sessionStorage for the tab.
//
// Non-destructive addition — does not modify next-auth session behavior.

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { apiGet, apiPost } from '@/lib/api';

export type AppUserRole = 'VIEWER' | 'CREATOR' | 'ADMIN';

interface RoleState {
  role: AppUserRole | null;
  hasSelectedRole: boolean;
  hasChannel: boolean;
  username: string | null;
  loading: boolean;
  error: boolean;
}

const CACHE_KEY = (uid: string) => `sv_role_${uid}`;
const EMPTY: RoleState = { role: null, hasSelectedRole: false, hasChannel: false, username: null, loading: true, error: false };

export function useUserRole() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [state, setState] = useState<RoleState>(EMPTY);

  const refetch = useCallback(async () => {
    if (!userId) { setState({ ...EMPTY, loading: false }); return; }
    try {
      const data = await apiGet<{ role: AppUserRole; hasSelectedRole: boolean; hasChannel?: boolean; username?: string | null }>(
        `/api/users/${encodeURIComponent(userId)}/role`
      );
      const next: RoleState = {
        role: data.role,
        hasSelectedRole: !!data.hasSelectedRole,
        hasChannel: !!data.hasChannel,
        username: data.username ?? null,
        loading: false,
        error: false,
      };
      setState(next);
      try { sessionStorage.setItem(CACHE_KEY(userId), JSON.stringify(next)); } catch {}
    } catch {
      // Network/server error. Never guess a downgrade to VIEWER — a wrong
      // guess could wrongly block an existing creator from their own studio.
      // If we have a cached role for this session, keep it; otherwise mark
      // the error so the caller can show a retry state instead of a loop.
      setState(s => s.role
        ? { ...s, loading: false, error: true }
        : { ...EMPTY, loading: false, error: true });
    }
  }, [userId]);

  useEffect(() => {
    if (status !== 'authenticated' || !userId) {
      if (status === 'unauthenticated') setState({ ...EMPTY, loading: false });
      return;
    }
    // Hydrate instantly from cache, then revalidate in background
    try {
      const cached = sessionStorage.getItem(CACHE_KEY(userId));
      if (cached) setState({ ...EMPTY, ...JSON.parse(cached), loading: false, error: false });
    } catch {}
    refetch();
  }, [status, userId, refetch]);

  const setRole = useCallback(async (role: 'VIEWER' | 'CREATOR') => {
    if (!userId) return;
    const data = await apiPost<{ id: string; role: AppUserRole; roleSelectedAt: string }>(
      `/api/users/${encodeURIComponent(userId)}/role`,
      { role }
    );
    setState(s => {
      const next: RoleState = { ...s, role: data.role, hasSelectedRole: true, loading: false, error: false };
      try { sessionStorage.setItem(CACHE_KEY(userId), JSON.stringify(next)); } catch {}
      return next;
    });
    return data;
  }, [userId]);

  const becomeCreator = useCallback(async () => {
    if (!userId) return;
    const data = await apiPost<{ id: string; role: AppUserRole; alreadyCreator: boolean }>(
      `/api/users/become-creator`,
      { userId }
    );
    setState(s => {
      const next: RoleState = { ...s, role: data.role, hasSelectedRole: true, loading: false, error: false };
      try { sessionStorage.setItem(CACHE_KEY(userId), JSON.stringify(next)); } catch {}
      return next;
    });
    return data;
  }, [userId]);

  return {
    role: state.role,
    hasSelectedRole: state.hasSelectedRole,
    hasChannel: state.hasChannel,
    username: state.username,
    loading: state.loading || status === 'loading',
    error: state.error,
    isCreator: state.role === 'CREATOR' || state.role === 'ADMIN',
    isViewer: state.role === 'VIEWER',
    isAdmin: state.role === 'ADMIN',
    setRole,
    becomeCreator,
    refetch,
  };
}
