'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface CoHost {
  id:          string;
  name:        string;
  coHostToken: string;
  joinUrl:     string;
  isActive:    boolean;
  createdAt:   string;
}

interface CoHostManagerProps {
  roomId:    string;
  hostToken: string;
}

export default function CoHostManager({ roomId, hostToken }: CoHostManagerProps) {
  const [coHosts, setCoHosts]   = useState<CoHost[]>([]);
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [copied, setCopied]     = useState<string | null>(null);

  useEffect(() => { fetchCoHosts(); }, []);

  const fetchCoHosts = async () => {
    try {
      const res = await fetch(`${API}/api/cohosts/${roomId}?hostToken=${hostToken}`);
      if (res.ok) setCoHosts(await res.json());
    } catch {}
  };

  const addCoHost = async () => {
    if (!name.trim()) { setError('Enter a name for the co-host'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API}/api/cohosts`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roomId, hostToken, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add co-host'); return; }
      setCoHosts(prev => [...prev, data]);
      setName('');
    } catch { setError('Failed to add co-host'); }
    setLoading(false);
  };

  const removeCoHost = async (id: string) => {
    try {
      await fetch(`${API}/api/cohosts/${id}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roomId, hostToken }),
      });
      setCoHosts(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  const copyLink = (ch: CoHost) => {
    navigator.clipboard.writeText(ch.joinUrl);
    setCopied(ch.id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">🎙</span>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Co-Hosts</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Invite up to 5 people to broadcast alongside you
          </p>
        </div>
      </div>

      {/* Add co-host form */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Co-host name
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCoHost()}
            placeholder="e.g. Alex, Sarah..."
            maxLength={30}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
              focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors
              placeholder-gray-300 dark:placeholder-gray-600 text-gray-900 dark:text-gray-100
              bg-white dark:bg-gray-900"
          />
          <button
            onClick={addCoHost}
            disabled={loading || coHosts.length >= 5}
            className="px-4 py-2 text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900
              rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            {loading ? '...' : 'Invite'}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
        {coHosts.length >= 5 && (
          <p className="text-xs text-amber-500 dark:text-amber-400">
            Maximum 5 co-hosts reached
          </p>
        )}
      </div>

      {/* Co-host list */}
      {coHosts.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            No co-hosts yet — invite someone above
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Active invites ({coHosts.length}/5)
          </p>
          {coHosts.map(ch => (
            <div key={ch.id}
              className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3 space-y-2">
              {/* Name + status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                    {ch.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{ch.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {ch.isActive ? '🟢 Connected' : '⏳ Not joined yet'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeCoHost(ch.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  Remove
                </button>
              </div>

              {/* Join link */}
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{ch.joinUrl}</p>
              </div>

              {/* Copy button */}
              <button
                onClick={() => copyLink(ch)}
                className={`w-full py-2 text-xs font-semibold rounded-lg border transition-all
                  ${copied === ch.id
                    ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-100 dark:border-green-500/20'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                {copied === ch.id ? '✓ Link copied!' : 'Copy invite link'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-3">
        <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold mb-1">
          How co-hosting works
        </p>
        <ul className="text-xs text-blue-600 dark:text-blue-400/80 space-y-0.5">
          <li>• Send the invite link to your co-host</li>
          <li>• They open it and get their own studio</li>
          <li>• Camera, screen share, mic, color grading</li>
          <li>• Viewers see all hosts simultaneously</li>
          <li>• Link expires when stream expires</li>
        </ul>
      </div>
    </div>
  );
}