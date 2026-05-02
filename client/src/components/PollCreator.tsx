'use client';
import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface PollData {
  id: string; question: string; options: string[];
  votes: number[]; status: string; totalVotes: number;
}

interface PollCreatorProps {
  roomId: string; hostToken: string;
  activePoll: PollData | null;
  onPollCreated: (p: PollData) => void;
  onPollClosed:  () => void;
}

export default function PollCreator({ roomId, hostToken, activePoll, onPollCreated, onPollClosed }: PollCreatorProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions]   = useState(['', '']);
  const [duration, setDuration] = useState(60);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [livePoll, setLivePoll] = useState<PollData | null>(activePoll);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => { setLivePoll(activePoll); }, [activePoll]);

  // Subscribe to real-time vote updates so host sees votes as they come in
  useEffect(() => {
    if (!roomId) return;
    const sock = io(API, { transports: ['websocket', 'polling'] });
    socketRef.current = sock;
    sock.on('connect', () => sock.emit('join-room', { roomId, nickname: 'Host' }));
    sock.on('poll-updated', ({ id, votes, totalVotes }: { id: string; votes: number[]; totalVotes: number }) => {
      setLivePoll(prev => prev?.id === id ? { ...prev, votes, totalVotes } as PollData : prev);
    });
    sock.on('poll-closed', ({ id, votes, totalVotes }: { id: string; votes: number[]; totalVotes: number }) => {
      setLivePoll(prev => prev?.id === id ? { ...prev, status: 'closed', votes, totalVotes } as PollData : prev);
    });
    return () => { sock.disconnect(); socketRef.current = null; };
  }, [roomId]);

  const addOption    = () => { if (options.length < 6) setOptions([...options, '']); };
  const removeOption = (i: number) => { if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i)); };

  const createPoll = async () => {
    const valid = options.filter(o => o.trim());
    if (!question.trim()) { setError('Enter a question'); return; }
    if (valid.length < 2) { setError('Add at least 2 options'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/polls`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, question: question.trim(), options: valid, duration }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      onPollCreated(data); setLivePoll(data);
      setQuestion(''); setOptions(['', '']);
    } catch (e: any) { setError(e.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const closePoll = async () => {
    if (!livePoll) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/polls/${livePoll.id}/close`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, roomId }),
      });
      onPollClosed(); setLivePoll(null);
    } catch {}
    setLoading(false);
  };

  // Active poll — shows live vote bars updating in real time
  if (livePoll) {
    const total    = livePoll.totalVotes || 0;
    const isClosed = livePoll.status === 'closed';
    const maxVotes = Math.max(...livePoll.votes, 1);
    return (
      <div className="space-y-3" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isClosed ? 'bg-gray-400' : 'bg-green-400 animate-pulse'}`} />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {isClosed ? 'Poll ended' : 'Live poll'}
            </span>
          </div>
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{total} votes</span>
        </div>

        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{livePoll.question}</p>

        <div className="space-y-2">
          {livePoll.options.map((opt, i) => {
            const pct      = total > 0 ? Math.round(livePoll.votes[i] / total * 100) : 0;
            const isWinner = isClosed && livePoll.votes[i] === maxVotes && livePoll.votes[i] > 0;
            return (
              <div key={i} className="relative overflow-hidden rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900">
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${isWinner ? 'bg-green-50 dark:bg-green-500/15' : 'bg-gray-50 dark:bg-gray-800'}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isWinner && <span className="text-xs flex-shrink-0">👑</span>}
                    <span className={`text-sm truncate ${isWinner ? 'font-semibold text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>{opt}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{livePoll.votes[i]}</span>
                    <span className={`text-xs font-bold w-8 text-right ${isWinner ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!isClosed && (
          <p className="text-xs text-center text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Updating live
          </p>
        )}

        {!isClosed ? (
          <button onClick={closePoll} disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg border border-red-100 dark:border-red-500/20 transition-colors disabled:opacity-40">
            {loading ? 'Ending...' : 'End poll'}
          </button>
        ) : (
          <button onClick={() => { setLivePoll(null); onPollClosed(); }}
            className="w-full py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-700 transition-colors">
            Create new poll
          </button>
        )}
      </div>
    );
  }

  // Create form
  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Question</label>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="What do you think?"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Options</label>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                placeholder={`Option ${i + 1}`}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900" />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)} className="w-7 h-7 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors text-lg flex-shrink-0">×</button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <button onClick={addOption} className="mt-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">+ Add option</button>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Duration</label>
        <select value={duration} onChange={e => setDuration(Number(e.target.value))}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900">
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
          <option value={120}>2 minutes</option>
          <option value={180}>3 minutes</option>
          <option value={300}>5 minutes</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}

      <button onClick={createPoll} disabled={loading}
        className="w-full py-2.5 text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors">
        {loading ? 'Launching...' : 'Launch poll'}
      </button>
    </div>
  );
}
