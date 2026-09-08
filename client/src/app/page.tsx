'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Radio, Users, Sparkles, Shield, Wallet, MessageSquare, Star } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeContext';
import IntroWrapper from '@/components/IntroWrapper';
import StreamRow from '@/components/discover/StreamRow';
import CreatorCard from '@/components/discover/CreatorCard';
import { apiGet } from '@/lib/api';
import { useUserRole } from '@/hooks/useUserRole';
import type { StreamCard as StreamCardType, CreatorSearchResult } from '@/lib/discover-types';

const FEATURES = [
  { icon: '🎥', title: 'Go live in one click', desc: 'Professional streaming studio, ready instantly — camera, screen share, or both.' },
  { icon: '🤖', title: 'AI-powered tools', desc: 'AI title suggestions, auto-summaries, and auto-generated highlight clips.' },
  { icon: '💬', title: 'Live chat & captions', desc: 'Real-time chat, polls, reactions, and live captions for every stream.' },
  { icon: '⏺', title: 'Recording & replays', desc: 'Every stream can be recorded automatically and revisited from your replay library.' },
  { icon: '🛡', title: 'Built-in moderation', desc: 'Keep your community safe with moderation tools available in every chat.' },
  { icon: '🌐', title: 'Restream anywhere', desc: 'Simulcast to YouTube and Instagram alongside Stream Vault.' },
];

const MONETIZATION = [
  { icon: Wallet, title: 'Donations & Super Chat', desc: 'Viewers can support you directly during a live stream.' },
  { icon: Star, title: 'Memberships', desc: 'Offer paid perks and recurring support tiers to your biggest fans.' },
  { icon: Radio, title: 'Pay-per-view streams', desc: 'Charge for access to special events and premium streams.' },
  { icon: Shield, title: 'You control your payouts', desc: 'Connect Stripe, Razorpay, or UPI once — never re-entered per stream.' },
];

const TESTIMONIALS = [
  { quote: 'I moved my whole coding stream here for the AI clip suggestions alone. Editing for shorts takes minutes now.', name: 'Creator, Technology' },
  { quote: 'My members renew every month because the perks actually feel worth it. Setup took ten minutes.', name: 'Creator, Music' },
  { quote: 'Captions changed who watches my streams — way more people stick around now.', name: 'Creator, Education' },
];

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] as any },
});

interface PlanPreview {
  id: string; name: string; displayName: string;
  priceMonthlyUSD: number; description: string;
}

export default function LandingPage() {
  const router = useRouter();
  const { status } = useSession();
  const { role, hasSelectedRole, hasChannel, loading: roleLoading } = useUserRole();

  const [liveNow, setLiveNow] = useState<StreamCardType[]>([]);
  const [topCreators, setTopCreators] = useState<CreatorSearchResult[]>([]);
  const [plans, setPlans] = useState<PlanPreview[]>([]);

  // ── Send signed-in users onward — landing is for visitors, not the inbox ──
  // No role chosen yet → onboarding (shown exactly once, ever). Role already
  // chosen → send each role to where it actually belongs: a Viewer to /feed,
  // a Creator to /studio (or /create-channel first, if they haven't set one
  // up yet). This is also where /login now sends already-authenticated
  // visitors (see middleware.ts) — so this one effect is the single source
  // of truth for "where does a returning user with a role land", instead of
  // duplicating that decision in multiple places.
  useEffect(() => {
    if (status !== 'authenticated' || roleLoading) return;
    if (!hasSelectedRole) { router.replace('/onboarding'); return; }
    if (role === 'CREATOR' || role === 'ADMIN') {
      router.replace(hasChannel ? '/studio' : '/create-channel');
    } else {
      router.replace('/feed');
    }
  }, [status, roleLoading, hasSelectedRole, role, hasChannel, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [live, trending, planData] = await Promise.all([
          apiGet<{ streams: StreamCardType[] }>('/api/discover/live?limit=8'),
          apiGet<{ mostViewed: StreamCardType[] }>('/api/discover/trending'),
          apiGet<PlanPreview[]>('/api/subscriptions/plans').catch(() => []),
        ]);
        if (cancelled) return;
        setLiveNow(live.streams);
        setPlans((Array.isArray(planData) ? planData : []).filter(p => p.name !== 'free').slice(0, 3));

        const seen = new Set<string>();
        const creators: CreatorSearchResult[] = [];
        for (const s of [...trending.mostViewed, ...live.streams]) {
          if (s.user && !seen.has(s.user.id)) {
            seen.add(s.user.id);
            creators.push({
              id: s.user.id, name: s.user.name, username: s.user.username,
              avatarUrl: s.user.avatarUrl, bio: null, followerCount: 0, streamCount: 0,
            });
          }
          if (creators.length >= 8) break;
        }
        if (!cancelled) setTopCreators(creators);
      } catch {
        // Discovery API unreachable — page still renders fully, just without live data sections.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Signed-in visitors are being redirected onward (see effect above) — show
  // a brief spinner instead of flashing the full marketing page at them.
  if (status === 'authenticated' && (roleLoading || hasSelectedRole)) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
      </div>
    );
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Stream Vault',
    description: 'Stream Vault is a creator platform by Aligncraft — go live, build a community, and get paid for it.',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any',
    creator: { '@type': 'Organization', name: 'Aligncraft' },
    featureList: [
      'Live streaming with camera and screen share',
      'AI title and summary generation',
      'Automatic highlight clips',
      'Live captions',
      'Stream recording and replay library',
      'Donations, Super Chat, memberships, and pay-per-view',
      'Real-time chat, polls, and moderation',
    ],
  };

  return (
    <IntroWrapper>
      <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200"
        style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        {/* Nav */}
        <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
            <span className="font-bold text-base sm:text-lg tracking-tight">StreamVault</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <button
              onClick={() => router.push('/login')}
              className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors whitespace-nowrap"
            >
              Log in
            </button>
          </div>
        </nav>

        {/* Hero */}
        <section className="max-w-3xl mx-auto px-4 sm:px-8 pt-14 sm:pt-24 pb-14 sm:pb-20 text-center">
          <motion.div {...fade(0)}>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-1.5 rounded-full mb-6 sm:mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {liveNow.length > 0 ? `${liveNow.length}+ streams live right now` : 'Live streaming, built for creators'}
            </span>
          </motion.div>

          <motion.h1
            {...fade(0.1)}
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-3 sm:mb-4"
            style={{ letterSpacing: '-0.03em' }}
          >
            Watch live.<br />
            <span className="text-red-500">Or go live yourself.</span>
          </motion.h1>

          <motion.p
            {...fade(0.15)}
            className="text-sm font-semibold text-gray-400 dark:text-gray-500 mb-6 sm:mb-8"
          >
            Creator Platform by Aligncraft
          </motion.p>

          <motion.p
            {...fade(0.2)}
            className="text-base sm:text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto mb-3 leading-relaxed px-2"
          >
            Stream Vault is where creators build a real audience and get paid for it — and where
            viewers find live content worth showing up for.
          </motion.p>

          <motion.p
            {...fade(0.22)}
            className="text-sm text-gray-400 dark:text-gray-500 max-w-md mx-auto mb-8 sm:mb-10 leading-relaxed px-2"
          >
            Built to help creators stream, grow communities, and monetize their audience.
          </motion.p>

          <motion.div {...fade(0.3)} className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push('/login')}
              className="w-full sm:w-auto px-6 py-3.5 sm:py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl sm:rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
            >
              Watch streams
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full sm:w-auto px-6 py-3.5 sm:py-3 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors rounded-xl sm:rounded-lg"
            >
              Become a Creator
            </button>
          </motion.div>
        </section>

        {/* Live Now */}
        {liveNow.length > 0 && (
          <section className="border-t border-gray-100 dark:border-gray-800 py-10 sm:py-14">
            <StreamRow title="Live right now" icon="🔴" streams={liveNow} />
          </section>
        )}

        {/* Trending Creators */}
        {topCreators.length > 0 && (
          <section className="border-t border-gray-100 dark:border-gray-800 py-10 sm:py-14">
            <div className="max-w-5xl mx-auto px-4 sm:px-8">
              <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold mb-5">
                <Users className="w-4 h-4" /> Trending creators
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                {topCreators.map(c => <CreatorCard key={c.id} creator={c} />)}
              </div>
            </div>
          </section>
        )}

        {/* Features */}
        <section id="features" className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 py-14 sm:py-20 transition-colors duration-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-8">
            <motion.h2
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center mb-10 sm:mb-12"
            >
              Everything you need to stream
            </motion.h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }} viewport={{ once: true }}
                  className="p-4 sm:p-5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950"
                >
                  <div className="flex sm:block items-start gap-3 sm:gap-0">
                    <div className="text-xl sm:mb-3">{f.icon}</div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-0.5 sm:mb-1">{f.title}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Monetization Benefits */}
        <section className="py-14 sm:py-20">
          <div className="max-w-3xl mx-auto px-4 sm:px-8">
            <motion.h2
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center mb-3"
            >
              For creators
            </motion.h2>
            <h3 className="text-2xl sm:text-3xl font-bold text-center mb-10 sm:mb-12" style={{ letterSpacing: '-0.02em' }}>
              Get paid for what you make
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
              {MONETIZATION.map((m, i) => (
                <motion.div
                  key={m.title}
                  initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }} viewport={{ once: true }}
                  className="flex items-start gap-3.5"
                >
                  <div className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center flex-shrink-0">
                    <m.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-0.5">{m.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{m.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 py-14 sm:py-20 transition-colors duration-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-8">
            <motion.h2
              initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center mb-10 sm:mb-12"
            >
              Creators on Stream Vault
            </motion.h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
              {TESTIMONIALS.map((t, i) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }} viewport={{ once: true }}
                  className="p-5 rounded-xl bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800"
                >
                  <MessageSquare className="w-4 h-4 text-red-400 mb-3" />
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">&quot;{t.quote}&quot;</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{t.name}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Preview */}
        {plans.length > 0 && (
          <section className="py-14 sm:py-20">
            <div className="max-w-3xl mx-auto px-4 sm:px-8">
              <motion.h2
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center mb-10 sm:mb-12"
              >
                Plans for creators
              </motion.h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                {plans.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.4 }} viewport={{ once: true }}
                    className="p-5 rounded-xl border border-gray-100 dark:border-gray-800 text-center"
                  >
                    <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">{p.displayName}</p>
                    <p className="text-2xl font-bold mb-2">${p.priceMonthlyUSD}<span className="text-sm font-normal text-gray-400">/mo</span></p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{p.description}</p>
                  </motion.div>
                ))}
              </div>
              <p className="text-center mt-6">
                <button onClick={() => router.push('/pricing')} className="text-sm font-semibold text-red-500 hover:underline">
                  See full pricing →
                </button>
              </p>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="border-t border-gray-100 dark:border-gray-800 py-14 sm:py-20 transition-colors duration-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }} viewport={{ once: true }}
            >
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 sm:mb-4" style={{ letterSpacing: '-0.02em' }}>
                Ready to start?
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6 sm:mb-8 text-sm sm:text-base">
                Sign up free — choose to watch or create.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="w-full sm:w-auto px-8 py-4 sm:py-3.5 bg-red-500 text-white text-sm font-semibold rounded-xl sm:rounded-lg hover:bg-red-600 transition-colors inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Get started
              </button>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-100 dark:border-gray-800 py-8 sm:py-10 px-4 sm:px-8 transition-colors duration-200">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-0 justify-between mb-6">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Stream Vault" className="w-5 h-5 object-contain" />
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Stream Vault</span>
              </div>
              <nav className="flex items-center gap-5 text-xs font-medium text-gray-400 dark:text-gray-500">
                <button onClick={() => router.push('/about')} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">About</button>
                <button onClick={() => router.push('/privacy')} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Privacy</button>
                <button onClick={() => router.push('/terms')} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Terms</button>
                <button onClick={() => router.push('/contact')} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Contact</button>
              </nav>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-0 justify-between text-xs text-gray-400 dark:text-gray-600">
              <span>© 2026 Aligncraft. All Rights Reserved.</span>
              <button onClick={() => router.push('/company')} className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Creator Platform by Aligncraft
              </button>
            </div>
          </div>
        </footer>
      </div>
    </IntroWrapper>
  );
}

