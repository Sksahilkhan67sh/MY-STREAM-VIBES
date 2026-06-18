'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Github, Twitter, Instagram, Youtube, Twitch, Globe, Calendar } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import StreamCard from '@/components/discover/StreamCard';
import FollowButton from '@/components/discover/FollowButton';
import { apiGet } from '@/lib/api';
import type { CreatorProfile } from '@/lib/discover-types';

const SOCIAL_ICONS: Record<string, any> = {
  github: Github, twitter: Twitter, x: Twitter, instagram: Instagram,
  youtube: Youtube, twitch: Twitch, website: Globe,
};

export default function CreatorProfilePage() {
  const params = useParams<{ idOrUsername: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? session?.user?.email ?? '';

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'live' | 'upcoming' | 'past'>('live');

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    const qs = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : '';
    apiGet<CreatorProfile>(`/api/creators/${encodeURIComponent(params.idOrUsername)}${qs}`)
      .then(p => {
        setProfile(p);
        setTab(p.liveStreams.length > 0 ? 'live' : p.upcomingStreams.length > 0 ? 'upcoming' : 'past');
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.idOrUsername, viewerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <SiteHeader />
        <div className="text-center py-24 px-4">
          <p className="text-gray-400 dark:text-gray-500 mb-4">This creator doesn&apos;t exist.</p>
          <button onClick={() => router.push('/')} className="text-red-500 font-semibold text-sm hover:underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const label = profile.name || profile.username || 'Creator';
  const initial = label.charAt(0).toUpperCase();
  const currentList = tab === 'live' ? profile.liveStreams : tab === 'upcoming' ? profile.upcomingStreams : profile.pastStreams;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      <SiteHeader />

      {/* Banner */}
      <div className="h-32 sm:h-48 bg-gradient-to-br from-red-500/20 to-gray-100 dark:to-gray-900 relative overflow-hidden">
        {profile.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.bannerUrl} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="px-4 sm:px-8">
        <div className="flex items-end gap-4 -mt-10 sm:-mt-12 mb-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-200 dark:bg-gray-700 border-4 border-white dark:border-gray-950 flex items-center justify-center overflow-hidden flex-shrink-0">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt={label} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-gray-500 dark:text-gray-400">{initial}</span>
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <h1 className="text-lg sm:text-2xl font-bold truncate">{label}</h1>
            {profile.username && <p className="text-sm text-gray-400 dark:text-gray-500">@{profile.username}</p>}
          </div>
          {viewerId !== profile.id && (
            <FollowButton creatorId={profile.id} initialFollowing={profile.isFollowing} />
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
          <span><strong className="text-gray-900 dark:text-gray-100">{profile.followerCount}</strong> followers</span>
        </div>

        {profile.bio && <p className="text-sm text-gray-600 dark:text-gray-300 max-w-2xl mb-3">{profile.bio}</p>}

        {Object.keys(profile.socialLinks || {}).length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            {Object.entries(profile.socialLinks).map(([key, url]) => {
              const Icon = SOCIAL_ICONS[key.toLowerCase()] || Globe;
              return (
                <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                  <Icon className="w-4 h-4" />
                </a>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 mb-6 rounded-xl bg-gray-100 dark:bg-gray-800 w-fit">
          {([
            { id: 'live', label: `Live (${profile.liveStreams.length})` },
            { id: 'upcoming', label: `Upcoming (${profile.upcomingStreams.length})` },
            { id: 'past', label: `Past streams (${profile.pastStreams.length})` },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap',
                tab === t.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pb-12">
          {currentList.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-2">
              {tab === 'upcoming' && <Calendar className="w-4 h-4" />}
              {tab === 'live' && 'Not live right now.'}
              {tab === 'upcoming' && 'No scheduled streams.'}
              {tab === 'past' && 'No past streams yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {currentList.map(s => <StreamCard key={s.id} stream={s} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
