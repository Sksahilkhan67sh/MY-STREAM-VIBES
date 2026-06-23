'use client';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Radio, Users, Wallet, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react';

const PILLARS = [
  { icon: Radio, title: 'Streaming', desc: 'Go live with camera, screen share, or both — no setup friction.' },
  { icon: Users, title: 'Community', desc: 'Chat, polls, co-hosting, and moderation built into every stream.' },
  { icon: Wallet, title: 'Monetization', desc: 'Donations, memberships, sponsorships, and pay-per-view, all in one place.' },
  { icon: ShieldCheck, title: 'Premium content', desc: 'Give your biggest fans something worth paying for.' },
];

export default function AboutPage() {
  const router = useRouter();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-[#070707] text-zinc-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-zinc-800/50">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Stream Vault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-zinc-100">Stream Vault</span>
        </a>
        <button
          onClick={() => router.push(session ? '/feed' : '/login')}
          className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
        >
          {session ? 'Back to app →' : 'Sign in'}
        </button>
      </nav>

      {/* Hero */}
      <section className="max-w-2xl mx-auto px-6 sm:px-12 pt-16 sm:pt-24 pb-12 sm:pb-16 text-center">
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
          className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4"
        >
          About
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
          className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
          style={{ letterSpacing: '-0.03em' }}
        >
          About Stream Vault
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="text-base sm:text-lg text-zinc-400 leading-relaxed"
        >
          Stream Vault is a modern creator platform designed to help creators build audiences,
          engage communities, and generate revenue through streaming, memberships, donations,
          sponsorships, and premium content.
        </motion.p>
      </section>

      {/* Pillars */}
      <section className="max-w-3xl mx-auto px-6 sm:px-12 py-10 sm:py-12 border-t border-zinc-800/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.4 }} viewport={{ once: true }}
              className="flex items-start gap-3.5 p-5 rounded-xl border border-zinc-800/60 bg-white/[0.02]"
            >
              <div className="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center flex-shrink-0">
                <p.icon className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-zinc-100 text-sm mb-0.5">{p.title}</div>
                <div className="text-sm text-zinc-500 leading-relaxed">{p.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Built by Aligncraft */}
      <section className="max-w-2xl mx-auto px-6 sm:px-12 py-12 sm:py-16 border-t border-zinc-800/50 text-center">
        <p className="text-sm text-zinc-500 mb-2">Built and maintained by</p>
        <a
          href="/company"
          className="inline-flex items-center gap-1.5 text-lg font-bold text-zinc-100 hover:text-red-400 transition-colors"
        >
          Aligncraft <ArrowRight className="w-4 h-4" />
        </a>
      </section>

      {/* Back link */}
      <section className="max-w-2xl mx-auto px-6 sm:px-12 pb-16 text-center">
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to home
        </button>
      </section>
    </div>
  );
}
