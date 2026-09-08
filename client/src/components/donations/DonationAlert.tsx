'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Star } from 'lucide-react';
import { Socket } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DonationAlertData {
  id:            string;
  donorName:     string;
  displayAmount: number;
  currency:      string;
  message?:      string;
  isHighlighted: boolean;
  isAnonymous:   boolean;
  gateway:       string;
}

interface DonationAlertProps {
  socket: Socket | null;
  roomId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DonationAlert({ socket, roomId }: DonationAlertProps) {
  const [queue, setQueue]       = useState<DonationAlertData[]>([]);
  const [current, setCurrent]   = useState<DonationAlertData | null>(null);
  const [visible, setVisible]   = useState(false);

  // Listen for donation events
  useEffect(() => {
    if (!socket) return;

    const handler = (data: DonationAlertData) => {
      setQueue(prev => [...prev, data]);
    };

    socket.on('donation-alert', handler);
    return () => { socket.off('donation-alert', handler); };
  }, [socket]);

  // Process queue — show one at a time
  useEffect(() => {
    if (visible || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    setVisible(true);

    const duration = next.isHighlighted ? 8000 : 6000;
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [queue, visible]);

  const symbol = current?.currency === 'INR' ? '₹' : '$';

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-sm px-4">
      <AnimatePresence>
        {visible && current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0,  scale: 1   }}
            exit={{    opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="relative overflow-hidden rounded-2xl pointer-events-auto"
            style={{
              background:  current.isHighlighted
                ? 'linear-gradient(135deg, rgba(255,53,32,0.2), rgba(255,100,50,0.1))'
                : 'rgba(20,20,22,0.95)',
              border:      `1px solid ${current.isHighlighted ? 'rgba(255,53,32,0.5)' : 'rgba(255,255,255,0.1)'}`,
              backdropFilter: 'blur(20px)',
              boxShadow:   current.isHighlighted
                ? '0 0 40px rgba(255,53,32,0.3), 0 16px 40px rgba(0,0,0,0.5)'
                : '0 16px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Shimmer line */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.3 }}
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,53,32,0.8), transparent)' }}
            />

            <div className="flex items-start gap-3 p-4">
              {/* Icon */}
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.1 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: current.isHighlighted
                    ? 'linear-gradient(135deg,#ff3520,#c81405)'
                    : 'rgba(255,53,32,0.15)',
                  border: `1px solid ${current.isHighlighted ? 'transparent' : 'rgba(255,53,32,0.3)'}`,
                }}
              >
                {current.isHighlighted
                  ? <Star  className="w-5 h-5 text-white" fill="white" />
                  : <Heart className="w-5 h-5 text-[#ff3520]" />
                }
              </motion.div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-zinc-100 truncate max-w-[130px]">
                    {current.donorName}
                  </span>
                  {current.isHighlighted && (
                    <span className="text-xs font-bold text-[#ff3520] bg-[#ff3520]/10 px-2 py-0.5 rounded-full border border-[#ff3520]/20">
                      Top donation!
                    </span>
                  )}
                </div>

                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xs text-zinc-400 mt-0.5"
                >
                  donated{' '}
                  <span
                    className="font-black text-base"
                    style={{ color: current.isHighlighted ? '#ff3520' : '#fff' }}
                  >
                    {symbol}{current.displayAmount}
                  </span>
                </motion.p>

                {current.message && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ delay: 0.4 }}
                    className="text-xs text-zinc-300 mt-1.5 italic line-clamp-2"
                    style={{ borderLeft: '2px solid rgba(255,53,32,0.4)', paddingLeft: 8 }}
                  >
                    &quot;{current.message}&quot;
                  </motion.p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 rounded-full"
              style={{ background: current.isHighlighted ? '#ff3520' : 'rgba(255,255,255,0.2)' }}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: current.isHighlighted ? 8 : 6, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue count badge */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white"
            style={{ background: '#ff3520' }}
          >
            {queue.length}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
