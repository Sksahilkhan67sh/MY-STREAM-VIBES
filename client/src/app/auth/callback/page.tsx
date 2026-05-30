'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setTokens, storeUser, apiFetch } from '@/lib/auth';
import { Suspense } from 'react';

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const accessToken  = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const error        = params.get('error');

    if (error || !accessToken || !refreshToken) {
      router.replace('/auth/login?error=oauth_failed');
      return;
    }

    setTokens(accessToken, refreshToken);

    // Fetch user profile with the new token
    apiFetch('/api/auth/me').then(res => res.json()).then(user => {
      storeUser(user);
      router.replace('/host');
    }).catch(() => router.replace('/host'));
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Signing you in…</p>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return <Suspense fallback={null}><CallbackInner /></Suspense>;
}
