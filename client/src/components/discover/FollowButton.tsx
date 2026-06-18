'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bell, BellOff } from 'lucide-react';
import { apiPost, apiDelete } from '@/lib/api';

export default function FollowButton({
  creatorId, initialFollowing, onChange,
}: {
  creatorId: string;
  initialFollowing: boolean;
  onChange?: (following: boolean) => void;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const toggle = async () => {
    if (status !== 'authenticated' || !userId) {
      router.push('/login');
      return;
    }
    setLoading(true);
    try {
      if (following) {
        await apiDelete('/api/creators/follow', { followerId: userId, creatorId });
        setFollowing(false);
        onChange?.(false);
      } else {
        await apiPost('/api/creators/follow', { followerId: userId, creatorId });
        setFollowing(true);
        onChange?.(true);
      }
    } catch {
      // best-effort — surface nothing disruptive, button just stays as-is
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={[
        'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50',
        following
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
          : 'bg-red-500 text-white hover:bg-red-600',
      ].join(' ')}
    >
      {following ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
