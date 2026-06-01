// client/src/app/login/page.tsx
'use client';
export const dynamic = 'force-dynamic';
import { signIn, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'authenticated') router.replace('/host');
  }, [status, router]);

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
      </div>
    );
  }

  const handleSignIn = async (provider: 'github' | 'google') => {
    setLoading(provider);
    setError('');
    try {
      await signIn(provider, { callbackUrl: '/host' });
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center px-4 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-gray-100">
            StreamVault
          </span>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="mb-6">
            <h1
              className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1"
              style={{ letterSpacing: '-0.02em' }}
            >
              Sign in to stream
            </h1>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Choose how you want to continue.
            </p>
          </div>

          <div className="space-y-3">
            {/* GitHub */}
            <button
              onClick={() => handleSignIn('github')}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl
                bg-gray-900 dark:bg-gray-100 hover:bg-gray-700 dark:hover:bg-white
                text-white dark:text-gray-900 text-sm font-semibold
                disabled:opacity-50 transition-all duration-150 group"
            >
              {loading === 'github' ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                </svg>
              )}
              Continue with GitHub
            </button>

            {/* Google */}
            <button
              onClick={() => handleSignIn('google')}
              disabled={!!loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl
                bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700
                text-gray-900 dark:text-gray-100 text-sm font-semibold
                border border-gray-200 dark:border-gray-700
                disabled:opacity-50 transition-all duration-150"
            >
              {loading === 'google' ? (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 rounded-lg"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <p className="text-xs text-gray-300 dark:text-gray-600 text-center mt-4">
          By signing in you agree to stream responsibly.
        </p>
      </motion.div>
    </div>
  );
}