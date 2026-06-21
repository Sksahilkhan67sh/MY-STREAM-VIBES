'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Check, X, Zap, Star, Building2, Sparkles,
  ArrowRight, Loader2, Shield,
} from 'lucide-react';

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id:                  string;
  name:                string;
  displayName:         string;
  description:         string;
  priceMonthlyINR:     number;
  priceYearlyINR:      number;
  priceMonthlyUSD:     number;
  priceYearlyUSD:      number;
  maxStreamsPerMonth:   number;
  maxViewersPerStream: number;
  maxStreamDuration:   number;
  maxStorageGB:        number;
  maxCoHosts:          number;
  canRecord:           boolean;
  canGoRTMP:           boolean;
  canRunPolls:         boolean;
  canAccessAnalytics:  boolean;
  canAcceptDonations:  boolean;
  canCustomBranding:   boolean;
  canScheduleStreams:  boolean;
  hasAIFeatures:       boolean;
  hasPrioritySupport:  boolean;
  hasWhiteLabel:       boolean;
  sortOrder:           number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  free:       Zap,
  basic:      Star,
  premium:    Sparkles,
  enterprise: Building2,
};

const PLAN_COLORS: Record<string, string> = {
  free:       '#71717a',
  basic:      '#3b82f6',
  premium:    '#ff3520',
  enterprise: '#8b5cf6',
};

const fmt = (paise: number, currency: 'INR' | 'USD') => {
  if (paise === 0) return 'Free';
  const amount = paise / 100;
  return currency === 'INR'
    ? `₹${amount.toLocaleString('en-IN')}`
    : `$${amount.toFixed(2)}`;
};

const limitLabel = (n: number, unit: string) =>
  n === -1 ? `Unlimited ${unit}` : `${n} ${unit}`;

// ─── Feature rows for comparison table ───────────────────────────────────────

const FEATURE_ROWS = [
  { key: 'maxStreamsPerMonth',   label: 'Streams / month',    format: (n: number) => n === -1 ? 'Unlimited' : String(n) },
  { key: 'maxViewersPerStream',  label: 'Viewers / stream',   format: (n: number) => n === -1 ? 'Unlimited' : String(n) },
  { key: 'maxStreamDuration',    label: 'Stream duration',    format: (n: number) => n === -1 ? 'Unlimited' : `${n} min` },
  { key: 'maxStorageGB',         label: 'Storage',            format: (n: number) => n === -1 ? 'Unlimited' : `${n} GB` },
  { key: 'maxCoHosts',           label: 'Co-hosts',           format: (n: number) => n === -1 ? 'Unlimited' : n === 0 ? 'None' : String(n) },
  { key: 'canRecord',            label: 'Recording',          format: null },
  { key: 'canGoRTMP',            label: 'RTMP streaming',     format: null },
  { key: 'canRunPolls',          label: 'Live polls',         format: null },
  { key: 'canAccessAnalytics',   label: 'Analytics',          format: null },
  { key: 'canAcceptDonations',   label: 'Donations',          format: null },
  { key: 'canCustomBranding',    label: 'Custom branding',    format: null },
  { key: 'hasAIFeatures',        label: 'AI features',        format: null },
  { key: 'hasPrioritySupport',   label: 'Priority support',   format: null },
  { key: 'hasWhiteLabel',        label: 'White label',        format: null },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router             = useRouter();
  const { data: session }  = useSession();
  const { isCreator } = useUserRole();
  const [plans, setPlans]  = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [subscribing, setSubscribing] = useState<string | null>(null);

  // ── FIX: read hostToken as state (SSR-safe) so it's always available ──
  const [hostToken, setHostToken] = useState('');
  useEffect(() => {
    const token = Object.keys(sessionStorage)
      .filter(k => k.startsWith('hostToken_'))
      .map(k => sessionStorage.getItem(k))
      .find(Boolean) ?? '';
    setHostToken(token);
  }, []);

  // ── FIX: NextAuth doesn't expose session.user.id by default; fall back to email ──
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  useEffect(() => {
    fetch(`${API}/api/subscriptions/plans`)
      .then(r => r.json())
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (plan: Plan) => {
    if (plan.name === 'free') return;
    if (!session) { router.push('/login'); return; }
    // ── FIX: if no hostToken, still allow upgrade (some plans don't need an active stream) ──
    if (!userId) { router.push('/login'); return; }

    setSubscribing(plan.id);
    try {
      const gateway = currency === 'INR' ? 'razorpay' : 'stripe';
      const res = await fetch(`${API}/api/subscriptions/subscribe`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, hostToken, planId: plan.id, billingCycle: billing, gateway, currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      if (gateway === 'razorpay' && data.subscriptionId) {
        // Load Razorpay script if not already present
        if (!(window as any).Razorpay) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error('Failed to load Razorpay. Please check your connection.'));
            document.body.appendChild(s);
          });
        }
        // ── FIX: guard against Razorpay still not available after script load ──
        const RazorpayClass = (window as any).Razorpay;
        if (!RazorpayClass) throw new Error('Razorpay payment provider is not available in your region.');
        const rzp = new RazorpayClass({
          key:             data.razorpayKeyId,
          subscription_id: data.subscriptionId,
          name:            'Stream Vault',
          description:     `${plan.displayName} Plan`,
          theme:           { color: '#ff3520' },
          handler:         () => { router.push('/billing?success=true'); },
        });
        rzp.open();
      } else if (gateway === 'stripe' && data.clientSecret) {
        const { loadStripe } = await import('@stripe/stripe-js');
        // ── FIX: guard against missing Stripe key to avoid uncaught runtime crash ──
        const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!stripeKey) throw new Error('Stripe is not configured. Please contact support.');
        const stripe = await loadStripe(stripeKey);
        if (!stripe) throw new Error('Failed to initialize Stripe. Please try again.');
        await stripe.confirmPayment({
          clientSecret:  data.clientSecret,
          confirmParams: { return_url: `${APP_URL}/billing?success=true` },
        });
      } else if (!data.subscriptionId && !data.clientSecret) {
        // Subscription created but no payment step needed (e.g. free upgrade or server redirect)
        router.push('/billing?success=true');
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to subscribe. Please try again.');
    } finally {
      setSubscribing(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
    </div>
  );

  const yearlyDiscount = 20; // %

  return (
    <div className="min-h-screen bg-zinc-950" style={{ fontFamily: "'DM Sans','Inter',sans-serif" }}>

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-zinc-800/50">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Stream Vault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-zinc-100">Stream Vault</span>
        </a>
        <div className="flex items-center gap-3">
          {session ? (
            <button onClick={() => router.push(isCreator ? '/studio' : '/feed')} className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors">
              {isCreator ? 'Go to dashboard →' : 'Browse streams →'}
            </button>
          ) : (
            <button onClick={() => router.push('/login')} className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors">
              Sign in
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">

        {/* ── Hero ── */}
        <div className="text-center mb-12 sm:mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{ background: 'rgba(255,53,32,0.1)', border: '1px solid rgba(255,53,32,0.2)', color: '#ff3520' }}>
              <Shield className="w-3 h-3" /> 7-day free trial on all paid plans
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-zinc-100 mb-4 tracking-tight" style={{ letterSpacing: '-0.03em' }}>
              Simple, transparent pricing
            </h1>
            <p className="text-lg text-zinc-400 max-w-xl mx-auto">
              Start free. Scale as you grow. No hidden fees, no surprises.
            </p>
          </motion.div>

          {/* Billing + Currency toggles */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            {/* Billing cycle */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {(['monthly', 'yearly'] as const).map(cycle => (
                <button
                  key={cycle}
                  onClick={() => setBilling(cycle)}
                  className="relative px-4 py-2 text-sm font-semibold rounded-lg transition-all capitalize"
                  style={{
                    background: billing === cycle ? 'white' : 'transparent',
                    color:      billing === cycle ? '#09090b' : '#71717a',
                  }}
                >
                  {cycle}
                  {cycle === 'yearly' && (
                    <span className="ml-2 text-xs font-black" style={{ color: billing === 'yearly' ? '#16a34a' : '#22c55e' }}>
                      -{yearlyDiscount}%
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Currency */}
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {(['INR', 'USD'] as const).map(cur => (
                <button
                  key={cur}
                  onClick={() => setCurrency(cur)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg transition-all"
                  style={{
                    background: currency === cur ? 'white' : 'transparent',
                    color:      currency === cur ? '#09090b' : '#71717a',
                  }}
                >
                  {cur === 'INR' ? '₹ INR' : '$ USD'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Plan cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-20">
          {plans.map((plan, i) => {
            const Icon    = PLAN_ICONS[plan.name] ?? Star;
            const color   = PLAN_COLORS[plan.name] ?? BRAND;
            const price   = currency === 'INR'
              ? (billing === 'yearly' ? plan.priceYearlyINR : plan.priceMonthlyINR)
              : (billing === 'yearly' ? plan.priceYearlyUSD : plan.priceMonthlyUSD);
            const isPopular  = plan.name === 'premium';
            const isFree     = plan.name === 'free';
            const isLoading  = subscribing === plan.id;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="relative rounded-2xl p-6 flex flex-col"
                style={{
                  background:  isPopular ? 'linear-gradient(160deg, rgba(255,53,32,0.12), rgba(255,53,32,0.04))' : 'rgba(255,255,255,0.03)',
                  border:      isPopular ? '1px solid rgba(255,53,32,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow:   isPopular ? '0 0 40px rgba(255,53,32,0.12)' : 'none',
                }}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-xs font-black text-white rounded-full" style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}>
                      Most popular
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-100 text-sm">{plan.displayName}</h3>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-4">
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black text-zinc-100">
                      {isFree ? 'Free' : fmt(price, currency)}
                    </span>
                    {!isFree && (
                      <span className="text-xs text-zinc-500 mb-1">
                        /{billing === 'yearly' ? 'yr' : 'mo'}
                      </span>
                    )}
                  </div>
                  {!isFree && billing === 'yearly' && (
                    <p className="text-xs text-green-400 mt-0.5">
                      Save {yearlyDiscount}% vs monthly
                    </p>
                  )}
                </div>

                <p className="text-xs text-zinc-500 mb-5 leading-relaxed">{plan.description}</p>

                {/* Key limits */}
                <div className="space-y-2 mb-6 flex-1">
                  {[
                    limitLabel(plan.maxStreamsPerMonth,   'streams/mo'),
                    limitLabel(plan.maxViewersPerStream,  'viewers'),
                    plan.maxStorageGB === -1 ? 'Unlimited storage' : `${plan.maxStorageGB} GB storage`,
                    plan.maxCoHosts === -1   ? 'Unlimited co-hosts' : plan.maxCoHosts === 0 ? 'No co-hosts' : `${plan.maxCoHosts} co-host${plan.maxCoHosts > 1 ? 's' : ''}`,
                    ...(plan.canRecord    ? ['Recording'] : []),
                    ...(plan.canGoRTMP    ? ['RTMP streaming'] : []),
                    ...(plan.hasAIFeatures? ['AI features'] : []),
                    ...(plan.hasWhiteLabel? ['White label'] : []),
                  ].map((feat, j) => (
                    <div key={j} className="flex items-center gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                      <span className="text-zinc-300">{feat}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isFree || isLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  style={{
                    background: isFree
                      ? 'rgba(255,255,255,0.05)'
                      : isPopular
                        ? 'linear-gradient(135deg,#ff3520,#c81405)'
                        : `${color}22`,
                    color:  isFree ? '#52525b' : isPopular ? 'white' : color,
                    border: isFree ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    cursor: isFree ? 'default' : 'pointer',
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isFree ? (
                    'Current plan'
                  ) : (
                    <>Start free trial <ArrowRight className="w-3.5 h-3.5" /></>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* ── Feature comparison table ── */}
        <div>
          <h2 className="text-xl font-black text-zinc-100 mb-6 text-center">Compare all features</h2>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {/* Header */}
            <div className="grid grid-cols-5 border-b border-zinc-800"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="px-5 py-4 text-xs font-bold text-zinc-500 uppercase tracking-wider">Feature</div>
              {plans.map(plan => {
                const color = PLAN_COLORS[plan.name] ?? '#71717a';
                return (
                  <div key={plan.id} className="px-4 py-4 text-center">
                    <span className="text-xs font-black" style={{ color }}>{plan.displayName}</span>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {FEATURE_ROWS.map((row, i) => (
              <div
                key={row.key}
                className="grid grid-cols-5 border-b border-zinc-800/50"
                style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
              >
                <div className="px-5 py-3.5 text-xs text-zinc-400 font-medium flex items-center">{row.label}</div>
                {plans.map(plan => {
                  const val   = (plan as unknown as Record<string, unknown>)[row.key];
                  const color = PLAN_COLORS[plan.name] ?? '#71717a';
                  return (
                    <div key={plan.id} className="px-4 py-3.5 flex items-center justify-center">
                      {row.format ? (
                        <span className="text-xs font-bold text-zinc-300">{row.format(val as number)}</span>
                      ) : val ? (
                        <Check className="w-4 h-4" style={{ color }} />
                      ) : (
                        <X className="w-3.5 h-3.5 text-zinc-700" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ footer ── */}
        <div className="mt-16 text-center">
          <p className="text-sm text-zinc-500">
            Questions? Email us at{' '}
            <a href="mailto:support@streamvault.app" className="text-zinc-300 underline underline-offset-4">
              support@streamvault.app
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

const BRAND = '#ff3520';
