'use client';
import { useState } from 'react';

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

export default function PollCreator({
  roomId, hostToken, activePoll, onPollCreated, onPollClosed,
}: PollCreatorProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions]   = useState(['', '']);
  const [duration, setDuration] = useState(60);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const addOption = () => {
    if (options.length < 6) setOptions([...options, '']);
  };

  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== i));
  };

  const createPoll = async () => {
    const validOptions = options.filter(o => o.trim());
    if (!question.trim()) { setError('Enter a question'); return; }
    if (validOptions.length < 2) { setError('Add at least 2 options'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, question: question.trim(), options: validOptions, duration }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create poll'); return; }
      onPollCreated(data);
      setQuestion(''); setOptions(['', '']);
    } catch (e: any) {
      setError(e.message || 'Failed to create poll');
    } finally { setLoading(false); }
  };

  const closePoll = async () => {
    if (!activePoll) return;
    setLoading(true);
    try {
      await fetch(`${API}/api/polls/${activePoll.id}/close`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, roomId }),
      });
      onPollClosed();
    } catch {}
    setLoading(false);
  };

  // Show active poll
  if (activePoll) {
    const total = activePoll.totalVotes || 0;
    return (
      <div className="space-y-3" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Poll active</span>
        </div>

        <p className="text-sm font-semibold text-gray-900">{activePoll.question}</p>

        <div className="space-y-2">
          {activePoll.options.map((opt, i) => {
            const pct = total > 0 ? Math.round(activePoll.votes[i] / total * 100) : 0;
            return (
              <div key={i} className="relative overflow-hidden rounded-lg border border-gray-100">
                <div
                  className="absolute inset-y-0 left-0 bg-gray-50 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-gray-700 truncate">{opt}</span>
                  <span className="text-xs font-semibold text-gray-400 ml-2 flex-shrink-0">
                    {activePoll.votes[i]} · {pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400">{total} total votes</p>

        <button
          onClick={closePoll}
          disabled={loading}
          className="w-full py-2.5 text-sm font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100 disabled:opacity-40"
        >
          End poll
        </button>
      </div>
    );
  }

  // Create poll form
  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* Question */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
          Question
        </label>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="What do you think?"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors placeholder-gray-300 text-gray-900"
        />
      </div>

      {/* Options */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
          Options
        </label>
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={e => {
                  const n = [...options]; n[i] = e.target.value; setOptions(n);
                }}
                placeholder={`Option ${i + 1}`}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors placeholder-gray-300 text-gray-900"
              />
              {options.length > 2 && (
                <button
                  onClick={() => removeOption(i)}
                  className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <button
            onClick={addOption}
            className="mt-2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            + Add option
          </button>
        )}
      </div>

      {/* Duration */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
          Duration
        </label>
        <select
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors text-gray-700 bg-white"
        >
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
          <option value={120}>2 minutes</option>
          <option value={180}>3 minutes</option>
          <option value={300}>5 minutes</option>
        </select>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <button
        onClick={createPoll}
        disabled={loading}
        className="w-full py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        {loading ? 'Launching...' : 'Launch poll'}
      </button>
    </div>
  );
}
