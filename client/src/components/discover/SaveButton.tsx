'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { apiPost, apiDelete } from '@/lib/api';

export default function SaveButton({ streamId, className = '' }: { streamId: string; className?: string }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (status !== 'authenticated' || !userId) return;
    setLoading(true);
    try {
      if (saved) {
        await apiDelete('/api/watchlater', { userId, streamId });
        setSaved(false);
      } else {
        await apiPost('/api/watchlater', { userId, streamId });
        setSaved(true);
      }
    } catch {}
    finally { setLoading(false); }
  };

  if (status !== 'authenticated') return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-label={saved ? 'Remove from Watch Later' : 'Save to Watch Later'}
      className={`p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors disabled:opacity-50 ${className}`}
    >
      {saved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
    </button>
  );
}
