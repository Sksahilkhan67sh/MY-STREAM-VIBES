'use client';
export const dynamic = 'force-dynamic';

// client/src/app/become-creator/page.tsx
//
// Viewer → Creator upgrade. No new account, no logout, no data loss.
// Reached when a VIEWER tries to access a protected creator route
// (see middleware.ts) or clicks "Become a Creator" anywhere in the app.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Radio, Sparkles, BarChart2, DollarSign, Users, ArrowRight } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

const PERKS = [
  { icon: Radio,      text: 'Go live instantly, no extra signup' },
  { icon: BarChart2,  text: 'Real-time analytics on every stream' },
  { icon: DollarSign, text: 'Earnings, donations & pay-per-view' },
  { icon: Users,      text: 'Build a community with memberships' },
];

export default function BecomeCreatorPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { role, loading, becomeCreator } = useUserRole();
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState('');

  const handleUpgrade = async () => {
    setUpgrading(true);
    setError('');
    try {
      await becomeCreator();
      router.replace('/studio');
    } catch {
      setError('Could not upgrade your account. Please try again.');
      setUpgrading(false);
    }
  };

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Sign in to become a creator.</p>
          <a href="/login" className="px-6 py-3 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">Sign in</a>
        </div>
      </div>
    );
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    );
  }

  // Already a creator/admin — nothing to do here
  if (role === 'CREATOR' || role === 'ADMIN') {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[#ff3520]/15 border border-[#ff3520]/25 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-7 h-7 text-[#ff3520]" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">You're already a creator</h1>
          <p className="text-sm text-zinc-500 mb-6">Head to your studio to go live or manage your channel.</p>
          <a href="/studio" className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">
            Go to Studio <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  const userName = session?.user?.name ?? session?.user?.email ?? 'there';

  return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4 py-12" style={{ fontFamily:"'DM Sans','Inter',sans-serif" }}>
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#ff3520]/15 border border-[#ff3520]/25 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-[#ff3520]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Become a Creator</h1>
          <p className="text-sm text-zinc-500">Hey {userName.split('@')[0]}, unlock creator tools with one click.</p>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 mb-6">
          <ul className="space-y-3">
            {PERKS.map((p, i) => {
              const Icon = p.icon;
              return (
                <li key={i} className="flex items-center gap-3 text-sm text-zinc-300">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-[#ff3520]" />
                  </div>
                  {p.text}
                </li>
              );
            })}
          </ul>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl mb-4 text-center">{error}</p>
        )}

        <button
          onClick={handleUpgrade}
          disabled={upgrading}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-[#ff3520] hover:bg-[#e02e1a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {upgrading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Radio className="w-4 h-4" />}
          {upgrading ? 'Upgrading your account...' : 'Become a Creator — it\'s free'}
        </button>
        <p className="text-zinc-700 text-xs text-center mt-4">No new account. No data loss. Your existing profile carries over.</p>

        <button onClick={() => router.push('/')} className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 mt-6">
          Not right now, take me back
        </button>
      </motion.div>
    </div>
  );
}
