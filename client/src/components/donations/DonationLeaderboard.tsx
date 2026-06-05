'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Heart, ChevronUp } from 'lucide-react';
import { Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ─── Leaderboard ──────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  donorName:   string;
  totalAmount: number;
  count:       number;
}

interface LeaderboardProps {
  roomId:   string;
  socket:   Socket | null;
  currency: string;
}

export function DonationLeaderboard({ roomId, socket, currency }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const symbol                = currency === 'INR' ? '₹' : '$';

  useEffect(() => {
    fetch(`${API}/api/donations/${roomId}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEntries(data.leaderboard ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {});
  }, [roomId]);

  useEffect(() => {
    if (!socket) return;
    const handler = ({ entries: e }: { entries: LeaderboardEntry[] }) => setEntries(e);
    socket.on('leaderboard-update', handler);
    return () => { socket.off('leaderboard-update', handler); };
  }, [socket]);

  if (entries.length === 0) return null;

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="text-xs font-bold text-zinc-300">Top Supporters</span>
        </div>
        <span className="text-xs font-bold" style={{ color: '#ff3520' }}>
          {symbol}{total.toFixed(0)} total
        </span>
      </div>

      {/* Entries */}
      <div className="p-2 space-y-0.5">
        <AnimatePresence>
          {entries.slice(0, 5).map((entry, i) => (
            <motion.div
              key={entry.donorName}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 px-2 py-2 rounded-xl"
              style={i === 0 ? { background: 'rgba(255,53,32,0.07)', border: '1px solid rgba(255,53,32,0.12)' } : {}}
            >
              <span className="text-base w-6 text-center shrink-0">
                {i < 3 ? MEDAL[i] : <span className="text-xs text-zinc-600 font-bold">{i + 1}</span>}
              </span>
              <span className="flex-1 text-sm font-semibold text-zinc-300 truncate">
                {entry.donorName}
              </span>
              <div className="text-right shrink-0">
                <p className="text-sm font-black" style={{ color: i === 0 ? '#ff3520' : '#f4f4f5' }}>
                  {symbol}{entry.totalAmount.toFixed(0)}
                </p>
                {entry.count > 1 && (
                  <p className="text-xs text-zinc-600">{entry.count}×</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Donate Button ────────────────────────────────────────────────────────────

interface DonateButtonProps {
  onClick: () => void;
  totalDonated?: number;
  currency?: string;
}

export function DonateButton({ onClick, totalDonated, currency = 'INR' }: DonateButtonProps) {
  const symbol = currency === 'INR' ? '₹' : '$';
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
      style={{ background: 'linear-gradient(135deg,#ff3520,#c81405)', boxShadow: '0 4px 14px rgba(255,53,32,0.35)' }}
    >
      <Heart className="w-4 h-4" />
      {totalDonated && totalDonated > 0 ? (
        <span>Donate · {symbol}{Math.round(totalDonated)}</span>
      ) : (
        <span>Support</span>
      )}
    </motion.button>
  );
}
