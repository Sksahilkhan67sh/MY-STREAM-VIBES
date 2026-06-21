'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Bookmark, History as HistoryIcon, Users, Crown, Settings as SettingsIcon } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import { useUserRole } from '@/hooks/useUserRole';

const LINKS = [
  { href: '/watch-later', label: 'Watch Later', icon: Bookmark },
  { href: '/history', label: 'Watch History', icon: HistoryIcon },
  { href: '/following', label: 'Following', icon: Users },
  { href: '/subscriptions', label: 'Subscriptions', icon: Crown },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isCreator } = useUserRole();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/profile');
  }, [status, router]);

  if (status !== 'authenticated') return null;

  const name = session?.user?.name || session?.user?.email || 'Your account';
  const avatar = session?.user?.image;
  const email = session?.user?.email;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12 max-w-2xl mx-auto">
        {/* Identity card */}
        <div className="flex items-center gap-4 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 mb-8">
          {avatar ? (
            <img src={avatar} alt="" className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xl font-bold text-gray-500">{name[0].toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{name}</h1>
            {email && <p className="text-sm text-gray-400 truncate">{email}</p>}
            {isCreator && (
              <button
                onClick={() => router.push('/studio')}
                className="mt-2 text-xs font-semibold text-red-500 hover:underline"
              >
                Go to Studio →
              </button>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {LINKS.map(l => (
            <button
              key={l.href}
              onClick={() => router.push(l.href)}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors text-left"
            >
              <l.icon className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-semibold">{l.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
