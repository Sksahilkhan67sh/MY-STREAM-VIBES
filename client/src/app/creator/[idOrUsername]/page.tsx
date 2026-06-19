'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Github, Twitter, Instagram, Youtube, Twitch, Globe, Calendar, BadgeCheck, Star, Crown, ShoppingBag, MessageSquare, Heart } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import StreamCard from '@/components/discover/StreamCard';
import FollowButton from '@/components/discover/FollowButton';
import { apiGet, apiPost } from '@/lib/api';
import type { CreatorProfile } from '@/lib/discover-types';

const SOCIAL_ICONS: Record<string, any> = {
  github: Github, twitter: Twitter, x: Twitter, instagram: Instagram,
  youtube: Youtube, twitch: Twitch, website: Globe,
};

interface MembershipTier { id: string; name: string; description?: string; price: number; color: string; perks: string[]; memberCount: number; isActive: boolean; }
interface MerchProduct { id: string; title: string; price: number; type: string; imageUrl?: string; externalUrl?: string; }
interface CommunityPost { id: string; type: string; body: string; imageUrl?: string; likeCount: number; isLiked: boolean; isPinned: boolean; createdAt: string; pollOptions: { id: string; text: string; voteCount: number; isVoted: boolean }[]; _count: { comments: number }; }

type StreamTab = 'live' | 'upcoming' | 'past';
type MainTab = 'streams' | 'community' | 'memberships' | 'merch';

export default function CreatorProfilePage() {
  const params = useParams<{ idOrUsername: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? session?.user?.email ?? '';

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [streamTab, setStreamTab] = useState<StreamTab>('live');
  const [mainTab, setMainTab] = useState<MainTab>('streams');

  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [products, setProducts] = useState<MerchProduct[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    const qs = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : '';
    apiGet<CreatorProfile>(`/api/creators/${encodeURIComponent(params.idOrUsername)}${qs}`)
      .then(p => {
        setProfile(p);
        setStreamTab(p.liveStreams.length > 0 ? 'live' : p.upcomingStreams.length > 0 ? 'upcoming' : 'past');
        const vq = viewerId ? `?viewerId=${encodeURIComponent(viewerId)}` : '';
        Promise.all([
          apiGet<{ tiers: MembershipTier[] }>(`/api/memberships/tiers/${p.id}${vq}`),
          apiGet<{ products: MerchProduct[] }>(`/api/merch/${p.id}`),
          apiGet<{ posts: CommunityPost[] }>(`/api/community/${p.id}/posts${vq}`),
        ]).then(([t, m, c]) => { setTiers(t.tiers); setProducts(m.products); setPosts(c.posts); }).catch(() => {});
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.idOrUsername, viewerId]);

  const subscribeTier = async (tierId: string) => {
    if (!viewerId) { router.push('/login'); return; }
    await apiPost('/api/memberships/subscribe', { userId: viewerId, tierId });
    setTiers(prev => prev.map(t => t.id === tierId ? { ...t, isActive: true, memberCount: t.memberCount + 1 } : t));
  };

  const likePost = async (postId: string) => {
    if (!viewerId) { router.push('/login'); return; }
    const res = await apiPost<{ liked: boolean }>(`/api/community/posts/${postId}/like`, { userId: viewerId });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: res.liked, likeCount: p.likeCount + (res.liked ? 1 : -1) } : p));
  };

  const votePoll = async (optionId: string, postId: string) => {
    if (!viewerId) { router.push('/login'); return; }
    try {
      await apiPost(`/api/community/polls/${optionId}/vote`, { userId: viewerId });
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        pollOptions: p.pollOptions.map(o => o.id === optionId ? { ...o, voteCount: o.voteCount + 1, isVoted: true } : o),
      } : p));
    } catch {}
  };

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
  const currentStreamList = streamTab === 'live' ? profile.liveStreams : streamTab === 'upcoming' ? profile.upcomingStreams : profile.pastStreams;

  const MAIN_TABS: { id: MainTab; label: string; icon: any; count?: number }[] = [
    { id: 'streams', label: 'Streams', icon: Calendar },
    { id: 'community', label: 'Community', icon: MessageSquare, count: posts.length },
    { id: 'memberships', label: 'Memberships', icon: Crown, count: tiers.length },
    { id: 'merch', label: 'Merch', icon: ShoppingBag, count: products.length },
  ];

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
            <h1 className="text-lg sm:text-2xl font-bold truncate flex items-center gap-1.5">
              {label}
              {profile.isVerified && <BadgeCheck className="w-5 h-5 text-blue-500 flex-shrink-0" />}
            </h1>
            {profile.username && <p className="text-sm text-gray-400 dark:text-gray-500">@{profile.username}</p>}
          </div>
          {viewerId !== profile.id && (
            <FollowButton creatorId={profile.id} initialFollowing={profile.isFollowing} />
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
          <span><strong className="text-gray-900 dark:text-gray-100">{profile.followerCount}</strong> followers</span>
          {profile.isVerified && (
            <span className="flex items-center gap-1 text-blue-500 font-medium capitalize">
              <BadgeCheck className="w-3.5 h-3.5" /> {profile.verifiedTier}
            </span>
          )}
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

        {/* Main section tabs */}
        <div className="flex gap-1 p-1 mb-6 rounded-xl bg-gray-100 dark:bg-gray-800 w-fit overflow-x-auto">
          {MAIN_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setMainTab(t.id)}
              className={[
                'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap',
                mainTab === t.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400',
              ].join(' ')}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}{t.count !== undefined && t.count > 0 ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        <div className="pb-12">
          {/* STREAMS */}
          {mainTab === 'streams' && (
            <>
              <div className="flex gap-1 p-1 mb-6 rounded-xl bg-gray-50 dark:bg-gray-900 w-fit">
                {([
                  { id: 'live', label: `Live (${profile.liveStreams.length})` },
                  { id: 'upcoming', label: `Upcoming (${profile.upcomingStreams.length})` },
                  { id: 'past', label: `Past streams (${profile.pastStreams.length})` },
                ] as const).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setStreamTab(t.id)}
                    className={[
                      'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap',
                      streamTab === t.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {currentStreamList.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {streamTab === 'live' && 'Not live right now.'}
                  {streamTab === 'upcoming' && 'No scheduled streams.'}
                  {streamTab === 'past' && 'No past streams yet.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {currentStreamList.map(s => <StreamCard key={s.id} stream={s} />)}
                </div>
              )}
            </>
          )}

          {/* COMMUNITY */}
          {mainTab === 'community' && (
            <div className="max-w-xl space-y-4">
              {posts.length === 0 ? (
                <p className="text-sm text-gray-400">No posts yet.</p>
              ) : posts.map(p => (
                <div key={p.id} className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800">
                  {p.isPinned && <span className="text-xs font-bold text-amber-500 mb-1 block">📌 Pinned</span>}
                  {p.type === 'announcement' && <span className="text-xs font-bold text-blue-500 mb-1 block">📢 Announcement</span>}
                  <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">{p.body}</p>
                  {p.imageUrl && <img src={p.imageUrl} alt="" className="rounded-xl w-full mb-2" />}
                  {p.pollOptions.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {p.pollOptions.map(o => {
                        const total = p.pollOptions.reduce((s, x) => s + x.voteCount, 0) || 1;
                        const pct = Math.round((o.voteCount / total) * 100);
                        return (
                          <button key={o.id} onClick={() => votePoll(o.id, p.id)} disabled={o.isVoted}
                            className="w-full text-left relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs">
                            <div className="absolute inset-0 bg-red-50 dark:bg-red-900/20" style={{ width: `${pct}%` }} />
                            <span className="relative z-10 flex justify-between"><span>{o.text}</span><span>{pct}%</span></span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button onClick={() => likePost(p.id)} className={['flex items-center gap-1.5 text-xs', p.isLiked ? 'text-red-500' : 'text-gray-400'].join(' ')}>
                    <Heart className={`w-3.5 h-3.5 ${p.isLiked ? 'fill-red-500' : ''}`} /> {p.likeCount} · 💬 {p._count.comments}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* MEMBERSHIPS */}
          {mainTab === 'memberships' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tiers.length === 0 ? (
                <p className="text-sm text-gray-400">No membership tiers available.</p>
              ) : tiers.map(t => (
                <div key={t.id} className="rounded-2xl border-2 p-5" style={{ borderColor: t.color }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-4 h-4 rounded-full" style={{ background: t.color }} />
                    <h3 className="font-bold">{t.name}</h3>
                  </div>
                  <p className="text-2xl font-bold mb-1">₹{(t.price / 100).toFixed(0)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
                  {t.description && <p className="text-xs text-gray-500 mb-2">{t.description}</p>}
                  <ul className="space-y-1 mb-4">
                    {t.perks.map((p, i) => <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5"><Star className="w-3 h-3 text-amber-400" />{p}</li>)}
                  </ul>
                  <button onClick={() => subscribeTier(t.id)} disabled={t.isActive}
                    className="w-full py-2 text-sm font-semibold rounded-lg disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 text-white"
                    style={{ background: t.isActive ? undefined : t.color }}>
                    {t.isActive ? 'Joined ✓' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* MERCH */}
          {mainTab === 'merch' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.length === 0 ? (
                <p className="text-sm text-gray-400">No products yet.</p>
              ) : products.map(p => (
                <div key={p.id} className="rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-4xl">
                    {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : (p.type === 'digital' ? '📁' : '👕')}
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-sm">{p.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 mb-2">₹{(p.price / 100).toFixed(0)}</p>
                    {p.externalUrl && (
                      <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="block text-center py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold rounded-lg">
                        Buy now
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
