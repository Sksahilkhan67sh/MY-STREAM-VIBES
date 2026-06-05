'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ticket, Lock, ArrowRight } from 'lucide-react';
import TicketPurchaseModal from './TicketPurchaseModal';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const STORAGE_KEY = (roomId: string) => `ppv_access_${roomId}`;

interface PPVGateProps {
  roomId:       string;
  streamTitle:  string;
  isPPV:        boolean;
  ppvPrice?:    number;
  currency?:    string;
  children:     React.ReactNode;
}

export default function PPVGate({
  roomId, streamTitle, isPPV, ppvPrice, currency = 'INR', children,
}: PPVGateProps) {
  const [hasAccess, setHasAccess]   = useState(false);
  const [checking, setChecking]     = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [ticketCode, setTicketCode] = useState('');

  useEffect(() => {
    if (!isPPV) { setHasAccess(true); setChecking(false); return; }

    // Check stored token first
    const stored = localStorage.getItem(STORAGE_KEY(roomId));

    // Also check URL param (from purchase redirect / email link)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken  = urlParams.get('ticket');
    const token     = urlToken ?? stored;

    if (!token) { setChecking(false); return; }

    // Validate with server
    fetch(`${API}/api/ppv/${roomId}/validate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ accessToken: token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          localStorage.setItem(STORAGE_KEY(roomId), token);
          setTicketCode(data.ticket?.ticketCode ?? '');
          setHasAccess(true);
        } else {
          localStorage.removeItem(STORAGE_KEY(roomId));
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [roomId, isPPV]);

  const handlePurchaseSuccess = (accessToken: string, code: string) => {
    localStorage.setItem(STORAGE_KEY(roomId), accessToken);
    setTicketCode(code);
    setHasAccess(true);
  };

  if (!isPPV || hasAccess) return <>{children}</>;

  if (checking) return (
    <div className="flex-1 flex items-center justify-center bg-zinc-950">
      <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
    </div>
  );

  const symbol = currency === 'INR' ? '₹' : '$';
  const price  = ppvPrice ? `${symbol}${(ppvPrice / 100).toLocaleString()}` : null;

  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-950 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center space-y-6"
      >
        {/* Lock icon */}
        <div className="flex justify-center">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(255,53,32,0.1)', border: '2px solid rgba(255,53,32,0.2)' }}
          >
            <Lock className="w-9 h-9 text-[#ff3520]" />
          </motion.div>
        </div>

        {/* Text */}
        <div>
          <h2 className="text-2xl font-black text-zinc-100 mb-2" style={{ letterSpacing: '-0.02em' }}>
            This stream is pay-per-view
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Purchase a ticket to watch <span className="text-zinc-200 font-semibold">{streamTitle}</span>
          </p>
          {price && (
            <p className="text-sm text-zinc-500 mt-1">
              Starting from <span className="font-bold text-zinc-200">{price}</span>
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold text-white transition-all"
          style={{
            background:  'linear-gradient(135deg, #ff3520, #c81405)',
            boxShadow:   '0 8px 24px rgba(255,53,32,0.35)',
          }}
        >
          <Ticket className="w-5 h-5" />
          Buy Ticket {price && `· from ${price}`}
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-xs text-zinc-600">Secure payment powered by Razorpay &amp; Stripe</p>
      </motion.div>

      {/* Purchase modal */}
      <AnimatePresence>
        {showModal && (
          <TicketPurchaseModal
            roomId={roomId}
            streamTitle={streamTitle}
            onClose={() => setShowModal(false)}
            onSuccess={handlePurchaseSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
