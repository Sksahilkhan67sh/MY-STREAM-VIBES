'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface PollData {
  id: string; question: string; options: string[];
  votes: number[]; status: string; endsAt: string | null; totalVotes: number;
}

function getVoterId(): string {
  if (typeof window === 'undefined') return Math.random().toString(36).slice(2);
  let id = sessionStorage.getItem('sv-voter-id');
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('sv-voter-id', id); }
  return id;
}

export default function PollWidget({ roomId, socket }: { roomId: string; socket: Socket | null }) {
  const [poll, setPoll]           = useState<PollData | null>(null);
  const [voted, setVoted]         = useState<number | null>(null);
  const [loading, setLoading]     = useState(false);
  const [timeLeft, setTimeLeft]   = useState(0);
  const [visible, setVisible]     = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef      = useRef<NodeJS.Timeout | null>(null);
  const hideTimerRef  = useRef<NodeJS.Timeout | null>(null);
  const currentId     = useRef<string | null>(null);
  const voterId       = useRef(getVoterId());

  const startCountdown = (endsAt: string | null) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!endsAt) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0 && timerRef.current) clearInterval(timerRef.current);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  };

  const showPoll = (data: PollData) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    currentId.current = data.id;
    setPoll(data); setVoted(null); setVisible(true); setDismissed(false);
    startCountdown(data.endsAt);
  };

  useEffect(() => {
    fetch(`${API}/api/polls/${roomId}/active`)
      .then(r => r.ok ? r.json() : null)
      .then((d: PollData | null) => { if (d?.status === 'active') showPoll(d); })
      .catch(() => {});
  }, [roomId]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (dismissed) return;
      fetch(`${API}/api/polls/${roomId}/active`)
        .then(r => r.ok ? r.json() : null)
        .then((d: PollData | null) => { if (d && d.id !== currentId.current) showPoll(d); })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(iv);
  }, [roomId, dismissed]);

  useEffect(() => {
    if (!socket) return;
    const onCreate   = (d: PollData) => showPoll(d);
    const onUpdate   = ({ id, votes, totalVotes }: any) =>
      setPoll(p => p?.id === id ? { ...p, votes, totalVotes } as PollData : p);
    const onClose    = ({ id, votes, totalVotes }: any) => {
      setPoll(p => p?.id === id ? { ...p, status: 'closed', votes, totalVotes } as PollData : p);
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
      hideTimerRef.current = setTimeout(() => setVisible(false), 8000);
    };
    socket.on('poll-created', onCreate);
    socket.on('poll-updated', onUpdate);
    socket.on('poll-closed', onClose);
    return () => { socket.off('poll-created', onCreate); socket.off('poll-updated', onUpdate); socket.off('poll-closed', onClose); };
  }, [socket]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const castVote = async (i: number) => {
    if (!poll || voted !== null || poll.status === 'closed' || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIndex: i, voterId: voterId.current, roomId }),
      });
      const d = await res.json();
      if (res.ok) { setVoted(i); setPoll(p => p ? { ...p, votes: d.votes, totalVotes: d.totalVotes } as PollData : p); }
      else if (d.error === 'Already voted') setVoted(i);
    } catch {}
    setLoading(false);
  };

  if (!poll || !visible || dismissed) return null;

  const isClosed    = poll.status === 'closed' || timeLeft === 0;
  const showResults = voted !== null || isClosed;

  return (
    <AnimatePresence>
      <motion.div
        key={poll.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.3 }}
        className="absolute bottom-4 right-4 w-72 z-30"
        style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
      >
        <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {isClosed ? 'Poll ended' : 'Live poll'}
              </span>
              {!isClosed && (
                <span className="flex items-center gap-1 text-xs text-red-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isClosed && timeLeft > 0 && (
                <span className="text-xs text-gray-400">{timeLeft}s</span>
              )}
              <button
                onClick={() => setDismissed(true)}
                className="text-gray-300 hover:text-gray-600 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">{poll.question}</p>

            <div className="space-y-2">
              {poll.options.map((opt, i) => {
                const pct      = poll.totalVotes > 0 ? Math.round(poll.votes[i] / poll.totalVotes * 100) : 0;
                const isWinner = isClosed && poll.votes[i] === Math.max(...poll.votes) && poll.votes[i] > 0;
                const myVote   = voted === i;

                return (
                  <button
                    key={i}
                    onClick={() => !showResults && castVote(i)}
                    disabled={showResults || loading}
                    className={`w-full text-left rounded-lg border text-sm relative overflow-hidden transition-all
                      ${showResults ? 'cursor-default' : 'hover:border-gray-300 cursor-pointer'}
                      ${myVote ? 'border-gray-900 bg-gray-50' : isWinner ? 'border-gray-300' : 'border-gray-100 bg-white'}`}
                  >
                    {/* Progress fill */}
                    {showResults && (
                      <motion.div
                        className={`absolute inset-y-0 left-0 ${myVote ? 'bg-gray-900/8' : 'bg-gray-100'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    )}
                    <div className="relative flex items-center justify-between px-3 py-2.5 gap-2">
                      <span className={`truncate ${myVote ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {opt}
                        {myVote && ' ✓'}
                      </span>
                      {showResults && (
                        <span className={`text-xs font-semibold flex-shrink-0 ${myVote ? 'text-gray-900' : 'text-gray-400'}`}>
                          {pct}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{poll.totalVotes} votes</span>
              {!showResults && <span>Tap to vote</span>}
              {isClosed && <span>Final results</span>}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
