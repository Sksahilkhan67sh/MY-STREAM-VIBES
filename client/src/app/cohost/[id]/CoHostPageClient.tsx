'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import CoHostStudio from '@/components/CoHostStudio';

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface CoHostData {
  livekitToken: string;
  identity: string;
  name: string;
  roomId: string;
  title: string;
}

export default function CoHostPageClient() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const roomId       = params.id as string;
  const coHostToken  = searchParams.get('token') || '';

  const [data, setData]       = useState<CoHostData | null>(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coHostToken) {
      setError('Missing co-host token. Use the invite link sent by the host.');
      setLoading(false);
      return;
    }
    fetch(`${API}/api/cohosts/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, coHostToken }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { setError(d.error || 'Failed to join'); return; }
        setData(d);
        // Remove token from URL so it doesn't appear in browser history or server logs
        window.history.replaceState({}, '', `/cohost/${roomId}`);
      })
      .catch(() => setError('Cannot connect to server.'))
      .finally(() => setLoading(false));
  }, [roomId, coHostToken]);

  if (loading) return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center"
      style={{ fontFamily:"'DM Sans','Inter',sans-serif" }}>
      <div className="flex items-center gap-3 text-gray-400 text-sm">
        <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
        Verifying co-host access...
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-6"
      style={{ fontFamily:"'DM Sans','Inter',sans-serif" }}>
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">🚫</div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2 text-lg">Access Denied</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">{error}</p>
        <a href="/" className="inline-block px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg">
          Back to home
        </a>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <CoHostStudio
      roomId={data.roomId}
      title={data.title}
      name={data.name}
      identity={data.identity}
      livekitToken={data.livekitToken}
      appUrl={APP_URL}
    />
  );
}
