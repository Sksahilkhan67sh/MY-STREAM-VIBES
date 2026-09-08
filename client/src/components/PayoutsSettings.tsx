'use client';
import { useState, useEffect } from 'react';
import { CreditCard, IndianRupee, Wallet, Check, ExternalLink } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api';

interface PayoutStatus {
  configured: boolean;
  stripeConnected: boolean;
  razorpayConnected: boolean;
  upiConnected: boolean;
  currency: string;
}

interface Props {
  userId: string;
}

/**
 * Studio → Settings → Payouts
 *
 * Lets a creator configure where their Super Chat / donation / membership
 * money goes, independent of any specific stream. This is the destination
 * the Stream Creation Wizard's Monetization step reads from and displays
 * ("Stripe Connected" etc.) — creators are never asked to re-enter payout
 * details per-stream, only here, once.
 *
 * Writes via PUT /api/donations/config/by-user/:userId, reads via
 * GET /api/donations/config/by-user/:userId — both additive endpoints that
 * sit alongside the existing hostToken-gated /config routes used while a
 * stream is live, without changing those at all.
 */
export default function PayoutsSettings({ userId }: Props) {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeForm, setActiveForm] = useState<'stripe' | 'razorpay' | 'upi' | null>(null);
  const [toast, setToast] = useState('');

  const [stripeKey, setStripeKey] = useState('');
  const [razorpayId, setRazorpayId] = useState('');
  const [razorpaySecret, setRazorpaySecret] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const data = await apiGet<PayoutStatus>(`/api/donations/config/by-user/${encodeURIComponent(userId)}`);
        setStatus(data);
      } catch {
        setStatus({ configured: false, stripeConnected: false, razorpayConnected: false, upiConnected: false, currency: 'INR' });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const save = async (payload: Record<string, string>) => {
    setSaving(true);
    try {
      await apiPut(`/api/donations/config/by-user/${encodeURIComponent(userId)}`, payload);
      const data = await apiGet<PayoutStatus>(`/api/donations/config/by-user/${encodeURIComponent(userId)}`);
      setStatus(data);
      setActiveForm(null);
      flash('Payout destination saved.');
    } catch (e: any) {
      flash(e?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    );
  }

  const destinations = [
    {
      id: 'stripe' as const,
      label: 'Stripe',
      icon: CreditCard,
      connected: status?.stripeConnected,
      description: 'Cards, wallets, and international payouts.',
    },
    {
      id: 'razorpay' as const,
      label: 'Razorpay',
      icon: Wallet,
      connected: status?.razorpayConnected,
      description: 'Cards, netbanking, wallets — India.',
    },
    {
      id: 'upi' as const,
      label: 'UPI',
      icon: IndianRupee,
      connected: status?.upiConnected,
      description: 'Direct UPI ID — India.',
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <h1 className="text-xl font-bold text-white mb-1.5">Payouts</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Configure where Super Chat, donations, memberships, and PPV money goes.
        Set this up once here — you won&apos;t be asked again when going live.
      </p>

      {toast && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          {toast}
        </div>
      )}

      <div className="space-y-3">
        {destinations.map(d => (
          <div key={d.id} className="bg-white/[0.03] rounded-2xl border border-white/[0.07] overflow-hidden">
            <div className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                d.connected ? 'bg-green-500/15 border border-green-500/25' : 'bg-white/[0.05] border border-white/[0.08]'
              }`}>
                <d.icon className={`w-5 h-5 ${d.connected ? 'text-green-400' : 'text-zinc-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{d.label}</p>
                  {d.connected && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" /> Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 truncate">{d.description}</p>
              </div>
              <button
                onClick={() => setActiveForm(activeForm === d.id ? null : d.id)}
                className="text-xs font-semibold text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/[0.10] hover:border-white/20 transition-colors flex-shrink-0"
              >
                {d.connected ? 'Update' : 'Connect'}
              </button>
            </div>

            {activeForm === d.id && (
              <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-white/[0.06]">
                {d.id === 'stripe' && (
                  <>
                    <input
                      value={stripeKey}
                      onChange={e => setStripeKey(e.target.value)}
                      placeholder="Stripe publishable key (pk_live_...)"
                      className="hub-input w-full"
                    />
                    <p className="text-xs text-zinc-600">
                      Full Stripe Connect onboarding (secret key, webhook secret) should be completed
                      with your platform administrator for security — this saves your publishable key
                      so the wizard and checkout can recognize Stripe as your destination.
                    </p>
                  </>
                )}
                {d.id === 'razorpay' && (
                  <>
                    <input
                      value={razorpayId}
                      onChange={e => setRazorpayId(e.target.value)}
                      placeholder="Razorpay Key ID"
                      className="hub-input w-full"
                    />
                    <input
                      value={razorpaySecret}
                      onChange={e => setRazorpaySecret(e.target.value)}
                      placeholder="Razorpay Key Secret"
                      type="password"
                      className="hub-input w-full"
                    />
                  </>
                )}
                {d.id === 'upi' && (
                  <>
                    <input
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                      placeholder="yourname@upi"
                      className="hub-input w-full"
                    />
                    <input
                      value={upiName}
                      onChange={e => setUpiName(e.target.value)}
                      placeholder="Display name (optional)"
                      className="hub-input w-full"
                    />
                  </>
                )}
                <button
                  disabled={saving}
                  onClick={() => {
                    if (d.id === 'stripe') save({ stripePublishableKey: stripeKey });
                    if (d.id === 'razorpay') save({ razorpayKeyId: razorpayId, razorpayKeySecret: razorpaySecret });
                    if (d.id === 'upi') save({ upiId, upiName });
                  }}
                  className="w-full py-2.5 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <a
        href="/pricing"
        className="mt-5 flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" /> Manage minimum amount, currency, and alert settings
      </a>
    </div>
  );
}
