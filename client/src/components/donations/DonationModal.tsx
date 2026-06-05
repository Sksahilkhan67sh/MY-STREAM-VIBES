'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, CreditCard, Smartphone, ChevronRight, Check, Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GatewayConfig {
  currency: string;
  minimumAmount: number;
  thankYouMessage: string;
  hasRazorpay: boolean;
  hasStripe: boolean;
  hasUPI: boolean;
  razorpayKeyId?: string;
  stripePublishableKey?: string;
  upiId?: string;
  upiName?: string;
}

interface DonationModalProps {
  roomId: string;
  streamerName: string;
  onClose: () => void;
}

type Step = 'amount' | 'details' | 'gateway' | 'processing' | 'success';
type Gateway = 'razorpay' | 'stripe' | 'upi';

const QUICK_AMOUNTS_INR = [50, 99, 199, 499, 999];
const QUICK_AMOUNTS_USD = [1, 5, 10, 25, 50];

// ─── Razorpay script loader ───────────────────────────────────────────────────

function loadRazorpay(): Promise<boolean> {
  return new Promise(resolve => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const script  = document.createElement('script');
    script.src    = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DonationModal({ roomId, streamerName, onClose }: DonationModalProps) {
  const [config, setConfig]         = useState<GatewayConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [step, setStep]             = useState<Step>('amount');
  const [amount, setAmount]         = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [message, setMessage]       = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [gateway, setGateway]       = useState<Gateway | null>(null);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [upiLink, setUpiLink]       = useState('');
  const [donationId, setDonationId] = useState('');

  useEffect(() => {
    fetch(`${API}/api/donations/config/public/${roomId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setConfig(data); setConfigLoading(false); })
      .catch(() => setConfigLoading(false));
  }, [roomId]);

  if (configLoading) return (
    <ModalWrapper onClose={onClose}>
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    </ModalWrapper>
  );

  if (!config) return (
    <ModalWrapper onClose={onClose}>
      <div className="text-center py-10 px-6">
        <p className="text-zinc-400 text-sm">Donations are not enabled for this stream.</p>
        <button onClick={onClose} className="mt-4 text-xs text-zinc-600 underline">Close</button>
      </div>
    </ModalWrapper>
  );

  const isINR       = config.currency === 'INR';
  const quickAmounts = isINR ? QUICK_AMOUNTS_INR : QUICK_AMOUNTS_USD;
  const symbol      = isINR ? '₹' : '$';
  const minDisplay  = config.minimumAmount / 100;
  const finalAmount = amount === 'custom' ? parseFloat(customAmount || '0') : parseFloat(amount || '0');
  const amountPaise = Math.round(finalAmount * 100);

  // ── STEP: amount ──────────────────────────────────────────────────────────

  if (step === 'amount') return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon={<Heart className="w-4 h-4 text-[#ff3520]" />} title={`Support ${streamerName}`} onClose={onClose} />
      <div className="px-6 pb-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Choose amount</p>
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map(a => (
              <button
                key={a}
                onClick={() => setAmount(String(a))}
                className="py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: amount === String(a) ? 'linear-gradient(135deg,#ff3520,#c81405)' : 'rgba(255,255,255,0.05)',
                  border:     amount === String(a) ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  color:      amount === String(a) ? 'white' : '#a1a1aa',
                }}
              >
                {symbol}{a}
              </button>
            ))}
            <button
              onClick={() => setAmount('custom')}
              className="py-2.5 rounded-xl text-sm font-bold transition-all col-span-3"
              style={{
                background: amount === 'custom' ? 'rgba(255,53,32,0.1)' : 'rgba(255,255,255,0.03)',
                border:     `1px solid ${amount === 'custom' ? 'rgba(255,53,32,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color:      amount === 'custom' ? '#ff3520' : '#71717a',
              }}
            >
              Custom amount
            </button>
          </div>

          <AnimatePresence>
            {amount === 'custom' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">{symbol}</span>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    placeholder={`Min ${symbol}${minDisplay}`}
                    className="w-full pl-8 pr-4 py-3 rounded-xl text-sm text-zinc-100 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                    autoFocus
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          disabled={!finalAmount || finalAmount < minDisplay}
          onClick={() => { setError(''); setStep('details'); }}
          className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}
        >
          Continue {finalAmount > 0 && `· ${symbol}${finalAmount}`} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </ModalWrapper>
  );

  // ── STEP: details ─────────────────────────────────────────────────────────

  if (step === 'details') return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon={<Heart className="w-4 h-4 text-[#ff3520]" />} title="Your details" onClose={onClose} />
      <div className="px-6 pb-6 space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,53,32,0.08)', border: '1px solid rgba(255,53,32,0.15)' }}>
          <Heart className="w-3.5 h-3.5 text-[#ff3520] shrink-0" />
          <span className="text-sm font-bold text-[#ff3520]">Donating {symbol}{finalAmount}</span>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIsAnonymous(!isAnonymous)}
            className="w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer"
            style={{ background: isAnonymous ? '#ff3520' : 'rgba(255,255,255,0.05)', border: isAnonymous ? 'none' : '1px solid rgba(255,255,255,0.15)' }}
          >
            {isAnonymous && <Check className="w-3 h-3 text-white" />}
          </div>
          <span className="text-sm text-zinc-400">Donate anonymously</span>
        </label>

        {!isAnonymous && (
          <div className="space-y-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="w-full px-4 py-3 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }} />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" type="email" className="w-full px-4 py-3 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '16px' }} />
          </div>
        )}

        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Leave a message for the streamer... (optional)"
          rows={3}
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600 resize-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <p className="text-xs text-zinc-600 text-right -mt-2">{message.length}/200</p>

        <div className="flex gap-2">
          <button onClick={() => setStep('amount')} className="flex-1 py-3 rounded-xl text-sm font-semibold text-zinc-500" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
          <button
            disabled={!isAnonymous && !name.trim()}
            onClick={() => setStep('gateway')}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}
          >
            Choose payment →
          </button>
        </div>
      </div>
    </ModalWrapper>
  );

  // ── STEP: gateway ─────────────────────────────────────────────────────────

  if (step === 'gateway') {
    const handlePay = async (gw: Gateway) => {
      setGateway(gw);
      setError('');
      setLoading(true);
      try {
        const orderRes = await fetch(`${API}/api/donations/${roomId}/order`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            donorName:   isAnonymous ? 'Anonymous' : (name || 'Anonymous'),
            donorEmail:  email || undefined,
            message:     message || undefined,
            amount:      amountPaise,
            currency:    config.currency,
            gateway:     gw,
            isAnonymous,
          }),
        });
        const order = await orderRes.json();
        if (!orderRes.ok) throw new Error(order.error || 'Failed to create order');
        setDonationId(order.donationId);

        if (gw === 'razorpay') {
          await handleRazorpay(order);
        } else if (gw === 'stripe') {
          await handleStripe(order);
        } else if (gw === 'upi') {
          setUpiLink(order.upiLink);
          setStep('processing');
          setLoading(false);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Payment failed');
        setLoading(false);
      }
    };

    const handleRazorpay = async (order: Record<string, string>) => {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Could not load Razorpay');

      return new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key:         order.keyId,
          amount:      amountPaise,
          currency:    config.currency,
          order_id:    order.orderId,
          name:        streamerName,
          description: message || 'Stream Donation',
          prefill:     { name: name || '', email: email || '' },
          theme:       { color: '#ff3520' },
          handler:     async (response: Record<string, string>) => {
            try {
              const vRes = await fetch(`${API}/api/donations/verify`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  donationId:       order.donationId,
                  gatewayOrderId:   response.razorpay_order_id,
                  gatewayPaymentId: response.razorpay_payment_id,
                  gatewaySignature: response.razorpay_signature,
                  gateway:          'razorpay',
                }),
              });
              if (!vRes.ok) throw new Error('Verification failed');
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

      const { error: stripeErr } = await stripe.confirmPayment({
        clientSecret:     order.clientSecret,
        confirmParams:    { return_url: `${window.location.origin}/donate/success` },
        redirect:         'if_required',
      });
      if (stripeErr) throw new Error(stripeErr.message);
      setStep('success');
      setLoading(false);
    };

    return (
      <ModalWrapper onClose={onClose}>
        <ModalHeader icon={<CreditCard className="w-4 h-4 text-[#ff3520]" />} title="Pay with" onClose={onClose} />
        <div className="px-6 pb-6 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-1" style={{ background: 'rgba(255,53,32,0.08)', border: '1px solid rgba(255,53,32,0.15)' }}>
            <Heart className="w-3.5 h-3.5 text-[#ff3520] shrink-0" />
            <span className="text-sm font-bold text-[#ff3520]">{symbol}{finalAmount} to {streamerName}</span>
          </div>

          {config.hasRazorpay && (
            <GatewayButton icon="🪙" label="Razorpay" sub="Cards, UPI, Netbanking, Wallets" loading={loading && gateway === 'razorpay'} onClick={() => handlePay('razorpay')} />
          )}
          {config.hasStripe && (
            <GatewayButton icon="💳" label="Stripe" sub="Credit/Debit cards worldwide" loading={loading && gateway === 'stripe'} onClick={() => handlePay('stripe')} />
          )}
          {config.hasUPI && (
            <GatewayButton icon="📱" label="UPI" sub="GPay, PhonePe, Paytm, BHIM" loading={loading && gateway === 'upi'} onClick={() => handlePay('upi')} />
          )}

          {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
          <button onClick={() => setStep('details')} className="w-full text-xs text-zinc-600 hover:text-zinc-400 pt-1">← Back</button>
        </div>
      </ModalWrapper>
    );
  }

  // ── STEP: UPI QR ──────────────────────────────────────────────────────────

  if (step === 'processing' && gateway === 'upi') return (
    <ModalWrapper onClose={onClose}>
      <ModalHeader icon={<Smartphone className="w-4 h-4 text-[#ff3520]" />} title="Pay via UPI" onClose={onClose} />
      <div className="px-6 pb-6 space-y-4 text-center">
        <p className="text-sm text-zinc-400">Open any UPI app and scan or tap the link below</p>
        <a
          href={upiLink}
          className="block w-full py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}
        >
          Open UPI App · {symbol}{finalAmount}
        </a>
        <p className="text-xs text-zinc-500">UPI ID: {config.upiId}</p>
        <div className="flex gap-2">
          <button onClick={() => setStep('gateway')} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-zinc-500" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
          <button
            onClick={async () => {
              const vRes = await fetch(`${API}/api/donations/verify`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ donationId, gatewayOrderId: donationId, gatewayPaymentId: `upi_${Date.now()}`, gateway: 'upi' }),
              });
              if (vRes.ok) setStep('success');
            }}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
          >
            ✓ I've paid
          </button>
        </div>
      </div>
    </ModalWrapper>
  );

  // ── STEP: success ─────────────────────────────────────────────────────────

  return (
    <ModalWrapper onClose={onClose}>
      <div className="px-6 py-10 text-center space-y-4">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(255,53,32,0.12)', border: '2px solid rgba(255,53,32,0.3)' }}
        >
          <Heart className="w-8 h-8 text-[#ff3520]" fill="currentColor" />
        </motion.div>
        <h2 className="text-xl font-black text-zinc-100">Thank you! 🎉</h2>
        <p className="text-sm text-zinc-400">{config.thankYouMessage}</p>
        <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)' }}>
          Back to stream
        </button>
      </div>
    </ModalWrapper>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        className="relative w-full sm:max-w-sm overflow-hidden"
        style={{
          background:   '#111113',
          border:       '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px 20px 0 0',
          boxShadow:    '0 -8px 40px rgba(0,0,0,0.6)',
        }}
        // @ts-expect-error - sm breakpoint styling
        smStyle={{ borderRadius: '20px' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,transparent,#ff3520,transparent)' }} />
        {children}
      </motion.div>
    </div>
  );
}

function ModalHeader({ icon, title, onClose }: { icon: React.ReactNode; title: string; onClose: () => void }) {
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

function GatewayButton({ icon, label, sub, loading, onClick }: { icon: string; label: string; sub: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all text-left disabled:opacity-60"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,53,32,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
    >
      <span className="text-2xl">{loading ? '⏳' : icon}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{sub}</p>
      </div>
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-600" />}
    </button>
  );
}
