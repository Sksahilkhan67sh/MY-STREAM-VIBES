'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CreditCard, CheckCircle, AlertTriangle,
  Download, Loader2, TrendingUp, RefreshCw, XCircle,
  Zap, Star, Sparkles, Building2, ArrowUpRight,
} from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Invoice {
  id:           string;
  amount:       number;
  currency:     string;
  status:       string;
  planName:     string;
  billingCycle: string;
  periodStart:  string;
  periodEnd:    string;
  paidAt:       string | null;
  pdfUrl:       string | null;
  gateway:      string | null;
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

const STATUS_COLORS: Record<string, string> = {
  active:     '#22c55e',
  trialing:   '#3b82f6',
  past_due:   '#f59e0b',
  canceled:   '#ef4444',
  free:       '#71717a',
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtAmt = (n: number, cur: string) =>
  `${cur === 'INR' ? '₹' : '$'}${n.toLocaleString()}`;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router         = useRouter();
  const params         = useSearchParams();
  const { data: session, status: authStatus } = useSession();

  const userId    = session?.user?.id ?? '';
  const hostToken = typeof window !== 'undefined'
    ? Object.keys(sessionStorage).filter(k => k.startsWith('hostToken_')).map(k => sessionStorage.getItem(k))[0] ?? ''
    : '';

  const { subscription, loading: subLoading, reload } = useSubscription(userId, hostToken);

  const [invoices, setInvoices]       = useState<Invoice[]>([]);
  const [invLoading, setInvLoading]   = useState(true);
  const [canceling, setCanceling]     = useState(false);
  const [showCancel, setShowCancel]   = useState(false);
  const [successMsg, setSuccessMsg]   = useState('');

  useEffect(() => {
    if (authStatus === 'unauthenticated') { router.replace('/login'); return; }
    if (params.get('success') === 'true') {
      setSuccessMsg('Subscription activated! Your plan is now live. 🎉');
      reload();
    }
  }, [authStatus, params]);

  useEffect(() => {
    if (!userId || !hostToken) return;
    fetch(`${API}/api/subscriptions/billing?userId=${userId}&hostToken=${encodeURIComponent(hostToken)}`)
      .then(r => r.ok ? r.json() : [])
      .then(setInvoices)
      .finally(() => setInvLoading(false));
  }, [userId, hostToken]);

  const handleCancel = async (immediately: boolean) => {
    setCanceling(true);
    try {
      const res = await fetch(`${API}/api/subscriptions/cancel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, hostToken, immediately }),
      });
      if (!res.ok) throw new Error('Failed to cancel');
      setShowCancel(false);
      setSuccessMsg(immediately
        ? 'Subscription cancelled immediately.'
        : 'Subscription will cancel at end of billing period.');
      reload();
    } catch (e) {
      alert('Failed to cancel subscription');
    } finally {
      setCanceling(false);
    }
  };

  if (authStatus === 'loading' || subLoading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
    </div>
  );

  const planName  = subscription?.planName ?? 'free';
  const PlanIcon  = PLAN_ICONS[planName] ?? Zap;
  const planColor = PLAN_COLORS[planName] ?? '#71717a';
  const statusColor = STATUS_COLORS[subscription?.status ?? 'free'] ?? '#71717a';

  // Usage percentages
  const streamPct = subscription?.features.maxStreamsPerMonth === -1
    ? 0
    : Math.min(100, ((subscription?.usage.streamsUsed ?? 0) / (subscription?.features.maxStreamsPerMonth ?? 1)) * 100);
  const storagePct = subscription?.features.maxStorageGB === -1
    ? 0
    : Math.min(100, ((subscription?.usage.storageUsedGB ?? 0) / (subscription?.features.maxStorageGB ?? 1)) * 100);

  return (
    <div className="min-h-screen bg-zinc-950" style={{ fontFamily: "'DM Sans','Inter',sans-serif" }}>

      {/* Nav */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-zinc-800/60"
        style={{ background: 'rgba(9,9,11,0.9)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-zinc-100">Billing &amp; Subscription</h1>
            <p className="text-xs text-zinc-500">Manage your plan</p>
          </div>
        </div>
        <button onClick={() => router.push('/pricing')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          style={{ background: 'rgba(255,53,32,0.1)', color: '#ff3520', border: '1px solid rgba(255,53,32,0.2)' }}>
          <TrendingUp className="w-3 h-3" /> Upgrade
        </button>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Success banner */}
        <AnimatePresence>
          {successMsg && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-sm text-green-300">{successMsg}</p>
              <button onClick={() => setSuccessMsg('')} className="ml-auto text-green-600 hover:text-green-400"><XCircle className="w-4 h-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current Plan Card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6"
          style={{ background: `linear-gradient(135deg, ${planColor}12, ${planColor}06)`, border: `1px solid ${planColor}25` }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: `${planColor}20`, border: `1px solid ${planColor}35` }}>
                <PlanIcon className="w-6 h-6" style={{ color: planColor }} />
              </div>
              <div>
                <h2 className="text-xl font-black text-zinc-100">{subscription?.displayName ?? 'Free'} Plan</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${statusColor}18`, color: statusColor }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                    {subscription?.status ?? 'free'}
                  </span>
                  {subscription?.billingCycle && subscription.billingCycle !== 'monthly' && (
                    <span className="text-xs text-zinc-500 capitalize">{subscription.billingCycle}</span>
                  )}
                </div>
              </div>
            </div>

            {planName !== 'free' && !subscription?.cancelAtPeriodEnd && (
              <button onClick={() => setShowCancel(true)}
                className="text-xs text-zinc-600 hover:text-red-400 transition-colors underline underline-offset-2">
                Cancel
              </button>
            )}
          </div>

          {subscription?.currentPeriodEnd && (
            <p className="text-xs text-zinc-500 mt-4">
              {subscription.cancelAtPeriodEnd
                ? `⚠️ Cancels on ${fmtDate(subscription.currentPeriodEnd)}`
                : `Renews on ${fmtDate(subscription.currentPeriodEnd)}`
              }
            </p>
          )}

          {subscription?.cancelAtPeriodEnd && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">Your subscription will not renew. You can resubscribe any time before it expires.</p>
            </div>
          )}
        </motion.div>

        {/* Usage */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">This Month's Usage</h3>
          <div className="space-y-4">
            <UsageBar
              label="Streams"
              used={subscription?.usage.streamsUsed ?? 0}
              max={subscription?.features.maxStreamsPerMonth ?? 3}
              unit="streams"
              pct={streamPct}
            />
            <UsageBar
              label="Storage"
              used={parseFloat((subscription?.usage.storageUsedGB ?? 0).toFixed(2))}
              max={subscription?.features.maxStorageGB ?? 1}
              unit="GB"
              pct={storagePct}
            />
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <button onClick={() => router.push('/pricing')}
              className="text-xs font-semibold flex items-center gap-1 transition-colors"
              style={{ color: '#ff3520' }}>
              <TrendingUp className="w-3.5 h-3.5" /> Upgrade for more
            </button>
          </div>
        </motion.div>

        {/* Invoice History */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Billing History</h3>
            <CreditCard className="w-4 h-4 text-zinc-600" />
          </div>

          {invLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-zinc-600" /></div>
          ) : invoices.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-zinc-600">No invoices yet.</p>
              <p className="text-xs text-zinc-700 mt-1">Invoices appear here after each billing cycle.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {invoices.map((inv, i) => (
                <motion.div key={inv.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: inv.status === 'paid' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)' }}>
                    {inv.status === 'paid'
                      ? <CheckCircle className="w-4 h-4 text-green-400" />
                      : <AlertTriangle className="w-4 h-4 text-amber-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{inv.planName}</p>
                    <p className="text-xs text-zinc-500">
                      {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-zinc-100">{fmtAmt(inv.amount, inv.currency)}</p>
                    <p className="text-xs text-zinc-600 capitalize">{inv.status}</p>
                  </div>
                  {inv.pdfUrl && (
                    <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Quick links */}
        <div className="flex gap-3">
          <button onClick={() => router.push('/pricing')}
            className="flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)', color: 'white' }}>
            <TrendingUp className="w-4 h-4" /> Upgrade Plan
          </button>
          <button onClick={() => { reload(); }}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-300 transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cancel modal */}
      <AnimatePresence>
        {showCancel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 className="font-bold text-zinc-100 mb-2">Cancel subscription</h3>
              <p className="text-sm text-zinc-400 mb-6">Choose how you'd like to cancel. You can resubscribe at any time.</p>
              <div className="space-y-2">
                <button
                  onClick={() => handleCancel(false)}
                  disabled={canceling}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                  Cancel at end of period
                </button>
                <button
                  onClick={() => handleCancel(true)}
                  disabled={canceling}
                  className="w-full py-3 rounded-xl text-sm font-bold"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                  Cancel immediately
                </button>
                <button
                  onClick={() => setShowCancel(false)}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-zinc-500"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  Never mind
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── UsageBar component ───────────────────────────────────────────────────────

function UsageBar({ label, used, max, unit, pct }: {
  label: string; used: number; max: number; unit: string; pct: number;
}) {
  const isUnlimited = max === -1;
  const isHigh      = pct > 80;
  const barColor    = isHigh ? '#ef4444' : pct > 60 ? '#f59e0b' : '#ff3520';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-zinc-400 font-semibold">{label}</span>
        <span className="text-zinc-300">
          {isUnlimited ? `${used} ${unit} (unlimited)` : `${used} / ${max} ${unit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: barColor }}
          />
        </div>
      )}
    </div>
  );
}
