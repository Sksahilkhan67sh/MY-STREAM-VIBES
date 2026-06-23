'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    // Logged client-side only — no PII, just for visibility into recurring errors.
    console.error('Stream Vault error boundary:', error);
  }, [error]);

  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center px-4 text-center"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
    >
      <img src="/logo.png" alt="Stream Vault" className="w-10 h-10 object-contain mb-5" />
      <p className="text-6xl font-bold tracking-tight mb-2" style={{ letterSpacing: '-0.03em' }}>500</p>
      <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-8">
        An unexpected error occurred. Try again, or head back home.
      </p>
      <div className="flex items-center gap-3 mb-10">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          Back to home
        </button>
      </div>
      <div className="text-xs text-gray-400 dark:text-gray-600">
        <span className="font-semibold text-gray-500 dark:text-gray-500">Stream Vault</span>
        <span className="mx-1.5">·</span>
        <span>by Aligncraft</span>
      </div>
    </div>
  );
}
