'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Ticket, CreditCard, ChevronRight,
  Check, Loader2, Smartphone, Star,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketTier {
  id:          string;
  name:        string;
  description?: string;
  price:       number;
  currency:    string;
  maxQuantity?: number;
  soldCount:   number;
  _count?:     { tickets: number };
}

interface TicketPurchaseModalProps {
  roomId:       string;
  streamTitle:  string;
  onClose:      () => void;
  onSuccess:    (accessToken: string, ticketCode: string) => void;
}

type Step = 'tiers' | 'details' | 'payment' | 'processing' | 'success';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sym = (cur: string) => cur === 'INR' ? '₹' : '$';
const fmtPrice = (price: number, cur: string) => `${sym(cur)}${(price / 100).toLocaleString()}`;

function loadRazorpay(): Promise<boolean> {
  return new Promise(resolve => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const s   = document.createElement('script');
    s.src     = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TicketPurchaseModal({
  roomId, streamTitle, onClose, onSuccess,
}: TicketPurchaseModalProps) {
  const [tiers, setTiers]           = useState<TicketTier[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [step, setStep]             = useState<Step>('tiers');
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [gateway, setGateway]       = useState<'razorpay' | 'stripe' | 'upi'>('razorpay');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [successData, setSuccessData] = useState<{ ticketCode: string; accessToken: string } | null>(null);
  const [upiLink, setUpiLink]       = useState('');
  const [pendingTicketId, setPendingTicketId] = useState('');

  useEffect(() => {
    fetch(`${API}/api/ppv/${roomId}/tiers`)
      .then(r => r.ok ? r.json() : [])
      .then(setTiers)
      .finally(() => setLoadingTiers(false));
  }, [roomId]);

  // ── Step: choose tier ─────────────────────────────────────────────────────

  if (step === 'tiers') return (
    <Wrapper onClose={onClose}>
      <Header icon={<Ticket className="w-4 h-4 text-[#ff3520]" />} title="Get your ticket" onClose={onClose} />
      <div className="px-6 pb-6 space-y-3">
        <p className="text-xs text-zinc-500">{streamTitle}</p>
        {loadingTiers ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">No tickets available for this stream.</p>
        ) : (
          tiers.map(tier => {
            const sold = tier.soldCount;
            const max  = tier.maxQuantity;
            const isSoldOut = max !== null && max !== undefined && sold >= max;
            return (
              <button
                key={tier.id}
                disabled={isSoldOut}
                onClick={() => { setSelectedTier(tier); setStep('details'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: selectedTier?.id === tier.id ? 'rgba(255,53,32,0.08)' : 'rgba(255,255,255,0.03)',
                  border:     selectedTier?.id === tier.id ? '1px solid rgba(255,53,32,0.3)' : '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => !isSoldOut && (e.currentTarget.style.borderColor = 'rgba(255,53,32,0.3)')}
                onMouseLeave={e => !isSoldOut && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,53,32,0.1)', border: '1px solid rgba(255,53,32,0.2)' }}>
                  <Star className="w-5 h-5 text-[#ff3520]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-zinc-100">{tier.name}</p>
                    {isSoldOut && (
                      <span className="text-xs font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">Sold out</span>
                    )}
                  </div>
                  {tier.description && <p className="text-xs text-zinc-500 mt-0.5 truncate">{tier.description}</p>}
                  {max && <p className="text-xs text-zinc-600 mt-0.5">{max - sold} of {max} remaining</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-zinc-100">{fmtPrice(tier.price, tier.currency)}</p>
                  <p className="text-xs text-zinc-600">per ticket</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </Wrapper>
  );

  // ── Step: buyer details ───────────────────────────────────────────────────

  if (step === 'details') return (
    <Wrapper onClose={onClose}>
      <Header icon={<Ticket className="w-4 h-4 text-[#ff3520]" />} title="Your details" onClose={onClose} />
      <div className="px-6 pb-6 space-y-4">
        <PriceBadge tier={selectedTier!} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name"
          className="w-full px-4 py-3 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }} />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (ticket sent here)" type="email"
          className="w-full px-4 py-3 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }} />
        <div className="flex gap-2 pt-1">
          <button onClick={() => setStep('tiers')} className="flex-1 py-3 rounded-xl text-sm font-semibold text-zinc-500"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
          <button
            disabled={!name.trim() || !email.includes('@')}
            onClick={() => setStep('payment')}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}>
            Continue →
          </button>
        </div>
      </div>
    </Wrapper>
  );

  // ── Step: payment method ──────────────────────────────────────────────────

  if (step === 'payment') {
    const handlePay = async (gw: typeof gateway) => {
      setGateway(gw);
      setError('');
      setLoading(true);
      try {
        const purchaseRes = await fetch(`${API}/api/ppv/${roomId}/purchase`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            tierId: selectedTier!.id,
            buyerName:  name,
            buyerEmail: email,
            gateway:    gw,
          }),
        });
        const order = await purchaseRes.json();
        if (!purchaseRes.ok) throw new Error(order.error ?? 'Purchase failed');

        setPendingTicketId(order.ticketId);

        if (gw === 'razorpay') await handleRazorpay(order);
        else if (gw === 'stripe') await handleStripe(order);
        else if (gw === 'upi') { setUpiLink(order.upiLink); setStep('processing'); setLoading(false); }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Payment failed');
        setLoading(false);
      }
    };

    const handleRazorpay = async (order: Record<string, string>) => {
      await loadRazorpay();
      return new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key:         order.keyId,
          amount:      selectedTier!.price,
          currency:    selectedTier!.currency,
          order_id:    order.orderId,
          name:        'Stream Vault',
          description: `${selectedTier!.name} — ${streamTitle}`,
          prefill:     { name, email },
          theme:       { color: '#ff3520' },
          handler: async (response: Record<string, string>) => {
            try {
              const vRes = await fetch(`${API}/api/ppv/verify`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  ticketId:         order.ticketId,
                  gatewayOrderId:   response.razorpay_order_id,
                  gatewayPaymentId: response.razorpay_payment_id,
                  gatewaySignature: response.razorpay_signature,
                  gateway:          'razorpay',
                }),
              });
              const data = await vRes.json();
              if (!vRes.ok) throw new Error(data.error);
              setSuccessData({ ticketCode: data.ticket.ticketCode, accessToken: data.accessToken });
              setStep('success');
              resolve();
            } catch (e) { reject(e); }
          },
          modal: { ondismiss: () => { setLoading(false); resolve(); } },
        });
        rzp.open();
        setLoading(false);
      });
    };

    const handleStripe = async (order: Record<string, string>) => {
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(order.publishableKey);
      if (!stripe) throw new Error('Stripe failed to load');
      const { error: sErr } = await stripe.confirmPayment({
        clientSecret:  order.clientSecret,
        confirmParams: { return_url: `${window.location.origin}/tickets/success` },
        redirect:      'if_required',
      });
      if (sErr) throw new Error(sErr.message);
      // If no redirect, verify immediately
      const vRes = await fetch(`${API}/api/ppv/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ticketId: order.ticketId, gatewayOrderId: order.ticketId, gatewayPaymentId: order.ticketId, gateway: 'stripe' }),
      });
      const data = await vRes.json();
      setSuccessData({ ticketCode: data.ticket.ticketCode, accessToken: data.accessToken });
      setStep('success');
      setLoading(false);
    };

    return (
      <Wrapper onClose={onClose}>
        <Header icon={<CreditCard className="w-4 h-4 text-[#ff3520]" />} title="Pay with" onClose={onClose} />
        <div className="px-6 pb-6 space-y-3">
          <PriceBadge tier={selectedTier!} />
          <GatewayBtn icon="🪙" label="Razorpay" sub="Cards, UPI, Netbanking, Wallets" loading={loading && gateway === 'razorpay'} onClick={() => handlePay('razorpay')} />
          <GatewayBtn icon="💳" label="Stripe" sub="International cards" loading={loading && gateway === 'stripe'} onClick={() => handlePay('stripe')} />
          <GatewayBtn icon="📱" label="UPI" sub="GPay, PhonePe, Paytm" loading={loading && gateway === 'upi'} onClick={() => handlePay('upi')} />
          {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-xl">{error}</p>}
          <button onClick={() => setStep('details')} className="w-full text-xs text-zinc-600 hover:text-zinc-400 pt-1">← Back</button>
        </div>
      </Wrapper>
    );
  }

  // ── Step: UPI waiting ─────────────────────────────────────────────────────

  if (step === 'processing') return (
    <Wrapper onClose={onClose}>
      <Header icon={<Smartphone className="w-4 h-4 text-[#ff3520]" />} title="Pay via UPI" onClose={onClose} />
      <div className="px-6 pb-6 space-y-4 text-center">
        <p className="text-sm text-zinc-400">Open any UPI app and complete your payment</p>
        <a href={upiLink} className="block w-full py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}>
          Open UPI App · {fmtPrice(selectedTier!.price, selectedTier!.currency)}
        </a>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setStep('payment')} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-zinc-500"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
          <button
            onClick={async () => {
              const vRes = await fetch(`${API}/api/ppv/verify`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId: pendingTicketId, gatewayOrderId: pendingTicketId, gatewayPaymentId: `upi_${Date.now()}`, gateway: 'upi' }),
              });
              const data = await vRes.json();
              if (vRes.ok) { setSuccessData({ ticketCode: data.ticket.ticketCode, accessToken: data.accessToken }); setStep('success'); }
            }}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
            ✓ I&apos;ve paid
          </button>
        </div>
      </div>
    </Wrapper>
  );

  // ── Step: success ─────────────────────────────────────────────────────────

  return (
    <Wrapper onClose={onClose}>
      <div className="px-6 py-8 text-center space-y-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(255,53,32,0.12)', border: '2px solid rgba(255,53,32,0.3)' }}>
          <Ticket className="w-8 h-8 text-[#ff3520]" />
        </motion.div>
        <h2 className="text-xl font-black text-zinc-100">You&apos;re in! 🎉</h2>
        {successData && (
          <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs text-zinc-500 mb-1">Your ticket code</p>
            <p className="text-2xl font-black text-zinc-100 tracking-widest">{successData.ticketCode}</p>
          </div>
        )}
        <p className="text-xs text-zinc-500">A confirmation email has been sent to <span className="text-zinc-300">{email}</span></p>
        <button
          onClick={() => { if (successData) onSuccess(successData.accessToken, successData.ticketCode); onClose(); }}
          className="w-full py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}>
          Enter stream →
        </button>
      </div>
    </Wrapper>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Wrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="relative w-full sm:max-w-sm overflow-hidden"
        style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px 20px 0 0' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,transparent,#ff3520,transparent)' }} />
        {children}
      </motion.div>
    </div>
  );
}

function Header({ icon, title, onClose }: { icon: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-6 pt-6 pb-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,53,32,0.12)', border: '1px solid rgba(255,53,32,0.2)' }}>
          {icon}
        </div>
        <h2 className="font-bold text-sm text-zinc-100">{title}</h2>
      </div>
      <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function PriceBadge({ tier }: { tier: TicketTier }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,53,32,0.08)', border: '1px solid rgba(255,53,32,0.15)' }}>
      <Ticket className="w-3.5 h-3.5 text-[#ff3520] shrink-0" />
      <span className="text-sm font-bold text-[#ff3520]">{tier.name} · {fmtPrice(tier.price, tier.currency)}</span>
    </div>
  );
}

function GatewayBtn({ icon, label, sub, loading, onClick }: { icon: string; label: string; sub: string; loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all disabled:opacity-60"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,53,32,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
      <span className="text-2xl">{loading ? '⏳' : icon}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{sub}</p>
      </div>
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-600" />}
    </button>
  );
}
