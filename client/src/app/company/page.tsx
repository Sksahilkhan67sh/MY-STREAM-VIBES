'use client';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeft, ExternalLink } from 'lucide-react';

// Add future Aligncraft products here — this list is the single place
// the /company page reads from, so a new product is a one-line addition.
const PRODUCTS: { name: string; tagline: string; href?: string; status?: 'live' | 'in development' }[] = [
  { name: 'Stream Vault', tagline: 'Creator platform — streaming, community, and monetization.', href: '/', status: 'live' },
  { name: 'Interv-Scale', tagline: 'AI-powered career readiness and interview preparation platform.', status: 'in development' },
  { name: 'Listener.World', tagline: 'A home for audio creators and their communities.', status: 'in development' },
];

export default function CompanyPage() {
  const router = useRouter();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-[#070707] text-zinc-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-zinc-800/50">
        <a href="/company" className="flex items-center gap-2.5">
          <img src="/brand/aligncraft-mark.png" alt="Aligncraft" className="w-7 h-7 object-contain" />
          <span className="font-bold text-zinc-100 tracking-tight">Aligncraft</span>
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
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="flex justify-center mb-6"
        >
          <img src="/brand/aligncraft-mark.png" alt="" className="w-14 h-14 object-contain" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
          className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
          style={{ letterSpacing: '-0.03em' }}
        >
          ALIGNCRAFT
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="text-base sm:text-lg text-zinc-400 leading-relaxed"
        >
          Building scalable software products for creators, learners, and communities.
        </motion.p>
      </section>

      {/* Products */}
      <section className="max-w-2xl mx-auto px-6 sm:px-12 py-10 sm:py-12 border-t border-zinc-800/50">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-center mb-8">
          Current Products
        </p>
        <div className="space-y-3">
          {PRODUCTS.map((p, i) => {
            const Wrapper = p.href ? 'a' : 'div';
            return (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }} viewport={{ once: true }}
              >
                <Wrapper
                  {...(p.href ? { href: p.href } : {})}
                  className={`flex items-center justify-between gap-4 p-5 rounded-xl border border-zinc-800/60 bg-white/[0.02] ${p.href ? 'hover:border-zinc-700 hover:bg-white/[0.04] transition-colors' : ''}`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-zinc-100 text-sm">{p.name}</span>
                      {p.status === 'in development' && (
                        <span className="text-[10px] font-semibold text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                          In development
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 leading-relaxed">{p.tagline}</p>
                  </div>
                  {p.href && <ExternalLink className="w-4 h-4 text-zinc-600 flex-shrink-0" />}
                </Wrapper>
              </motion.div>
            );
          })}
        </div>
        <p className="text-xs text-zinc-600 text-center mt-8">
          More products coming soon.
        </p>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 sm:px-12 py-12 sm:py-16 border-t border-zinc-800/50 text-center">
        <a
          href="/about"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          About Stream Vault <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </section>

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
