'use client';
export const dynamic = 'force-dynamic';

// client/src/app/onboarding/page.tsx
//
// Shown once after signup: choose Viewer or Creator experience.
// Does not block existing users — middleware only sends people here when
// hasSelectedRole is false (see middleware.ts).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Eye, Radio, ArrowRight } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession();
  const { setRole } = useUserRole();
  const [choosing, setChoosing] = useState<'VIEWER' | 'CREATOR' | null>(null);
  const [error, setError] = useState('');

  const choose = async (role: 'VIEWER' | 'CREATOR') => {
    setChoosing(role);
    setError('');
    try {
      await setRole(role);
      router.replace(role === 'CREATOR' ? '/create-channel' : '/');
    } catch {
      setError('Something went wrong. Please try again.');
      setChoosing(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4 py-12" style={{ fontFamily:"'DM Sans','Inter',sans-serif" }}>
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">Choose your experience</h1>
          <p className="text-zinc-500 text-sm">You can switch to creator mode anytime later.</p>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl mb-6 text-center">{error}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={!!choosing}
            onClick={() => choose('VIEWER')}
            className="group text-left p-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-white/20 transition-colors disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mb-4">
              <Eye className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Watch Streams</h2>
            <p className="text-sm text-zinc-500 mb-4">I am a Viewer — discover and follow creators.</p>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-400">
              {choosing === 'VIEWER' ? 'Setting up...' : 'Continue as Viewer'}
              {choosing !== 'VIEWER' && <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />}
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={!!choosing}
            onClick={() => choose('CREATOR')}
            className="group text-left p-6 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-[#ff3520]/40 transition-colors disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-xl bg-[#ff3520]/15 border border-[#ff3520]/25 flex items-center justify-center mb-4">
              <Radio className="w-6 h-6 text-[#ff3520]" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Create Content</h2>
            <p className="text-sm text-zinc-500 mb-4">I am a Creator — go live and build an audience.</p>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-[#ff3520]">
              {choosing === 'CREATOR' ? 'Setting up...' : 'Continue as Creator'}
              {choosing !== 'CREATOR' && <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />}
            </div>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
