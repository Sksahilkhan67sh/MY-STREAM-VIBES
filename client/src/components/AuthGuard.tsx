'use client';
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Simple host auth using a configurable PIN stored in env ──
// Set NEXT_PUBLIC_HOST_PIN in your .env.local to require a PIN
// If not set, defaults to "stream" so existing deploys keep working
const HOST_PIN = process.env.NEXT_PUBLIC_HOST_PIN || 'stream';
const AUTH_KEY = 'sv_host_authed';

interface AuthContextType {
  isAuthed: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({ isAuthed: false, logout: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const submit = () => {
    if (!pin.trim()) { setError('Enter your host PIN'); return; }
    setLoading(true);
    setTimeout(() => {
      if (pin === HOST_PIN) {
        localStorage.setItem(AUTH_KEY, '1');
        onSuccess();
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center px-4 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-gray-100">StreamVault</span>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
          <div className="mb-5">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1" style={{ letterSpacing: '-0.02em' }}>
              Host sign in
            </h1>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Enter your host PIN to access the dashboard.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                Host PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={e => { setPin(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="Enter your PIN"
                autoFocus
                className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl
                  focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors
                  placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100
                  bg-white dark:bg-gray-800"
                style={{ fontSize: '16px' }}
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 rounded-lg border border-red-100 dark:border-red-500/20"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              onClick={submit}
              disabled={loading}
              className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold
                rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying...' : 'Sign in →'}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-300 dark:text-gray-600 text-center mt-4">
          Contact your administrator for access
        </p>
      </motion.div>
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [checked, setChecked]   = useState(false);

  useEffect(() => {
    const authed = localStorage.getItem(AUTH_KEY) === '1';
    setIsAuthed(authed);
    setChecked(true);
  }, []);

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthed(false);
  };

  if (!checked) return null; // avoid flash

  return (
    <AuthContext.Provider value={{ isAuthed, logout }}>
      {isAuthed ? children : <LoginForm onSuccess={() => setIsAuthed(true)} />}
    </AuthContext.Provider>
  );
}
