'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Video, Users, Star, ShoppingBag, MessageSquare,
  BadgeCheck, Handshake, ChevronRight, Eye, TrendingUp,
  Plus, Trash2, Edit2, Check, X, Upload, ExternalLink,
  DollarSign, Crown, Settings, Zap,
} from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Tab = 'overview' | 'streams' | 'memberships' | 'merch' | 'community' | 'verification' | 'sponsorship' | 'profile';

interface StudioStream {
  id: string; roomId: string; title: string; isLive: boolean;
  viewerCount: number; createdAt: string; thumbnailUrl?: string;
  category?: { name: string; icon: string };
}

interface MembershipTier {
  id: string; name: string; description?: string; price: number; color: string;
  perks: string[]; memberCount: number;
}

interface MerchProduct {
  id: string; title: string; price: number; type: string; stock?: number;
  imageUrl?: string; externalUrl?: string; isActive: boolean;
}

interface CommunityPost {
  id: string; type: string; body: string; likeCount: number; isPinned: boolean;
  createdAt: string; _count: { comments: number };
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800">
      <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function StudioPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [tab, setTab] = useState<Tab>('overview');
  const [streams, setStreams] = useState<StudioStream[]>([]);
  const [followers, setFollowers] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [products, setProducts] = useState<MerchProduct[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [verification, setVerification] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form states
  const [newTier, setNewTier] = useState({ name: '', description: '', price: '', color: '#6366f1', perks: '' });
  const [newProduct, setNewProduct] = useState({ title: '', description: '', price: '', type: 'physical', externalUrl: '', stock: '' });
  const [newPost, setNewPost] = useState({ type: 'text', body: '', imageUrl: '' });
  const [profileForm, setProfileForm] = useState({ username: '', bio: '', avatarUrl: '', bannerUrl: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/streams?userId=${encodeURIComponent(userId)}`).then(r => r.json()),
      apiGet<any>(`/api/creators/${userId}`),
      apiGet<any>(`/api/verification/${userId}`),
      apiGet<{ tiers: MembershipTier[] }>(`/api/memberships/tiers/${userId}`),
      apiGet<{ products: MerchProduct[] }>(`/api/merch/${userId}`),
      apiGet<{ posts: CommunityPost[] }>(`/api/community/${userId}/posts`),
    ]).then(([streamsData, creatorData, verif, tiersData, merchData, postsData]) => {
      setStreams(streamsData.streams ?? []);
      setFollowers(creatorData.followerCount ?? 0);
      setTotalViews((streamsData.streams ?? []).reduce((s: number, st: any) => s + (st.viewerCount || 0), 0));
      setVerification(verif);
      setTiers(tiersData.tiers ?? []);
      setProducts(merchData.products ?? []);
      setPosts(postsData.posts ?? []);
      setProfile(creatorData);
      setProfileForm({
        username: creatorData.username ?? '',
        bio: creatorData.bio ?? '',
        avatarUrl: creatorData.avatarUrl ?? '',
        bannerUrl: creatorData.bannerUrl ?? '',
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const createTier = async () => {
    if (!newTier.name || !newTier.price) return;
    try {
      const t = await apiPost<MembershipTier>('/api/memberships/tiers', {
        creatorId: userId, name: newTier.name, description: newTier.description,
        price: parseInt(newTier.price) * 100,
        color: newTier.color,
        perks: newTier.perks.split('\n').filter(Boolean),
      });
      setTiers(prev => [...prev, t]);
      setNewTier({ name: '', description: '', price: '', color: '#6366f1', perks: '' });
      toast('Membership tier created!');
    } catch { toast('Failed to create tier'); }
  };

  const createProduct = async () => {
    if (!newProduct.title || !newProduct.price) return;
    try {
      const p = await apiPost<MerchProduct>('/api/merch', {
        creatorId: userId, title: newProduct.title, description: newProduct.description,
        price: parseInt(newProduct.price) * 100, type: newProduct.type,
        externalUrl: newProduct.externalUrl || undefined,
        stock: newProduct.stock ? parseInt(newProduct.stock) : undefined,
      });
      setProducts(prev => [...prev, p]);
      setNewProduct({ title: '', description: '', price: '', type: 'physical', externalUrl: '', stock: '' });
      toast('Product added!');
    } catch { toast('Failed to add product'); }
  };

  const createPost = async () => {
    if (!newPost.body) return;
    try {
      const p = await apiPost<any>('/api/community/posts', { userId, ...newPost });
      setPosts(prev => [p, ...prev]);
      setNewPost({ type: 'text', body: '', imageUrl: '' });
      toast('Post published!');
    } catch { toast('Failed to post'); }
  };

  const deletePost = async (id: string) => {
    await apiDelete('/api/community/posts/' + id, { userId });
    setPosts(prev => prev.filter(p => p.id !== id));
    toast('Post deleted');
  };

  const pinPost = async (id: string) => {
    await apiPost('/api/community/posts/' + id + '/pin', { userId });
    const updated = await apiGet<{ posts: CommunityPost[] }>(`/api/community/${userId}/posts`);
    setPosts(updated.posts);
  };

  const applyVerification = async () => {
    try {
      const v = await apiPost('/api/verification/apply', { userId });
      setVerification(v);
      toast('Verification application submitted!');
    } catch { toast('Failed to apply'); }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiPatch('/api/creators/profile', { userId, ...profileForm });
      toast('Profile saved!');
    } catch { toast('Failed to save'); }
    finally { setSaving(false); }
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'streams', label: 'Streams', icon: Video },
    { id: 'memberships', label: 'Memberships', icon: Crown },
    { id: 'merch', label: 'Merch Store', icon: ShoppingBag },
    { id: 'community', label: 'Community', icon: MessageSquare },
    { id: 'verification', label: 'Verification', icon: BadgeCheck },
    { id: 'sponsorship', label: 'Sponsorship', icon: Handshake },
    { id: 'profile', label: 'Channel', icon: Settings },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="font-bold text-sm">Creator Studio</span>
          {profile?.isVerified && (
            <span className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold px-2 py-0.5 rounded-full">
              <BadgeCheck className="w-3 h-3" /> {profile.verifiedTier ?? 'Verified'}
            </span>
          )}
        </div>
        <button onClick={() => router.push('/host')} className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors">
          <Zap className="w-3.5 h-3.5" /> Go Live
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden sm:flex flex-col w-52 min-h-[calc(100vh-60px)] bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 py-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors text-left',
                tab === t.id ? 'text-red-500 bg-red-50 dark:bg-red-900/20 border-r-2 border-red-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              <t.icon className="w-4 h-4 flex-shrink-0" />
              {t.label}
            </button>
          ))}
        </aside>

        {/* Mobile tab row */}
        <div className="sm:hidden w-full fixed bottom-0 left-0 z-20 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex overflow-x-auto">
          {TABS.slice(0, 5).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={['flex flex-col items-center gap-0.5 px-3 py-2 flex-1 text-[10px]', tab === t.id ? 'text-red-500' : 'text-gray-400'].join(' ')}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-8 pb-20 sm:pb-8">
          {msg && (
            <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm rounded-xl border border-green-100 dark:border-green-800">
              {msg}
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div>
              <h1 className="text-xl font-bold mb-6">Dashboard</h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard label="Total Followers" value={followers.toLocaleString()} icon={Users} color="bg-blue-500" />
                <StatCard label="Live Streams" value={streams.filter(s => s.isLive).length} icon={Video} color="bg-red-500" />
                <StatCard label="Total Streams" value={streams.length} icon={Eye} color="bg-purple-500" />
                <StatCard label="Active Members" value={tiers.reduce((s, t) => s + t.memberCount, 0)} icon={Crown} color="bg-amber-500" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800">
                  <h2 className="font-semibold text-sm mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-red-500" /> Recent Streams</h2>
                  {streams.slice(0, 5).map(s => (
                    <div key={s.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                      <div className="w-12 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs overflow-hidden">
                        {s.thumbnailUrl ? <img src={s.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : '📺'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{s.title}</p>
                        <p className="text-[10px] text-gray-400">{s.viewerCount} viewers</p>
                      </div>
                      {s.isLive && <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded">LIVE</span>}
                    </div>
                  ))}
                  {streams.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No streams yet — go live to start!</p>}
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800">
                  <h2 className="font-semibold text-sm mb-4 flex items-center gap-2"><Crown className="w-4 h-4 text-amber-500" /> Membership Tiers</h2>
                  {tiers.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-400 mb-3">No membership tiers yet</p>
                      <button onClick={() => setTab('memberships')} className="text-xs text-red-500 font-medium hover:underline">Create your first tier →</button>
                    </div>
                  ) : tiers.map(t => (
                    <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{t.name}</p>
                        <p className="text-[10px] text-gray-400">₹{(t.price / 100).toFixed(0)}/month · {t.memberCount} members</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STREAMS ── */}
          {tab === 'streams' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold">Your Streams</h1>
                <button onClick={() => router.push('/host')} className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600">
                  <Plus className="w-4 h-4" /> New Stream
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {streams.map(s => (
                  <div key={s.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative">
                      {s.thumbnailUrl ? <img src={s.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">📺</div>}
                      {s.isLive && <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">LIVE</span>}
                    </div>
                    <div className="p-4">
                      <p className="font-semibold text-sm truncate mb-1">{s.title}</p>
                      <p className="text-xs text-gray-400">{s.viewerCount} viewers · {new Date(s.createdAt).toLocaleDateString()}</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => router.push(`/dashboard/${s.roomId}`)} className="flex-1 py-1.5 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                          Manage
                        </button>
                        <button onClick={() => router.push(`/s/${s.roomId}`)} className="flex-1 py-1.5 text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-200">
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {streams.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-gray-400 mb-4">You haven't streamed yet.</p>
                  <button onClick={() => router.push('/host')} className="px-6 py-3 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600">Start your first stream →</button>
                </div>
              )}
            </div>
          )}

          {/* ── MEMBERSHIPS ── */}
          {tab === 'memberships' && (
            <div>
              <h1 className="text-xl font-bold mb-2">Membership Tiers</h1>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Create monthly membership tiers for your most dedicated fans.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {tiers.map(t => (
                  <div key={t.id} className="bg-white dark:bg-gray-900 rounded-2xl border-2 p-5" style={{ borderColor: t.color }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: t.color }} />
                      <h3 className="font-bold">{t.name}</h3>
                    </div>
                    <p className="text-2xl font-bold mb-1">₹{(t.price / 100).toFixed(0)}<span className="text-sm font-normal text-gray-400">/mo</span></p>
                    <p className="text-xs text-gray-400 mb-3">{t.memberCount} members</p>
                    <ul className="space-y-1">
                      {t.perks.map((p, i) => <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5"><Check className="w-3 h-3 text-green-500" />{p}</li>)}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
                <h2 className="font-semibold mb-4">Create New Tier</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input value={newTier.name} onChange={e => setNewTier(p => ({ ...p, name: e.target.value }))} placeholder="Tier name (e.g. Gold)" className="input-base" />
                  <input value={newTier.price} onChange={e => setNewTier(p => ({ ...p, price: e.target.value }))} placeholder="Price (₹/month)" type="number" className="input-base" />
                  <input value={newTier.description} onChange={e => setNewTier(p => ({ ...p, description: e.target.value }))} placeholder="Short description" className="input-base sm:col-span-2" />
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-500">Color:</label>
                    <input type="color" value={newTier.color} onChange={e => setNewTier(p => ({ ...p, color: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                  </div>
                  <textarea value={newTier.perks} onChange={e => setNewTier(p => ({ ...p, perks: e.target.value }))} placeholder="Perks (one per line)&#10;Early access to streams&#10;Members-only badge" rows={4} className="input-base sm:col-span-2 resize-none" />
                </div>
                <button onClick={createTier} className="mt-4 px-6 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600">Create Tier</button>
              </div>
            </div>
          )}

          {/* ── MERCH ── */}
          {tab === 'merch' && (
            <div>
              <h1 className="text-xl font-bold mb-2">Merch Store</h1>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">List products from external stores or digital downloads.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {products.map(p => (
                  <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-4xl">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : (p.type === 'digital' ? '📁' : '👕')}
                    </div>
                    <div className="p-4">
                      <p className="font-semibold text-sm">{p.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.type} · ₹{(p.price / 100).toFixed(0)}</p>
                      {p.externalUrl && (
                        <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:underline">
                          <ExternalLink className="w-3 h-3" /> Visit store
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6">
                <h2 className="font-semibold mb-4">Add Product</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input value={newProduct.title} onChange={e => setNewProduct(p => ({ ...p, title: e.target.value }))} placeholder="Product title" className="input-base" />
                  <input value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} placeholder="Price (₹)" type="number" className="input-base" />
                  <select value={newProduct.type} onChange={e => setNewProduct(p => ({ ...p, type: e.target.value }))} className="input-base">
                    <option value="physical">Physical</option>
                    <option value="digital">Digital</option>
                  </select>
                  <input value={newProduct.stock} onChange={e => setNewProduct(p => ({ ...p, stock: e.target.value }))} placeholder="Stock (blank = unlimited)" type="number" className="input-base" />
                  <input value={newProduct.externalUrl} onChange={e => setNewProduct(p => ({ ...p, externalUrl: e.target.value }))} placeholder="External store URL" className="input-base sm:col-span-2" />
                </div>
                <button onClick={createProduct} className="mt-4 px-6 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600">Add Product</button>
              </div>
            </div>
          )}

          {/* ── COMMUNITY ── */}
          {tab === 'community' && (
            <div>
              <h1 className="text-xl font-bold mb-6">Community Posts</h1>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-6">
                <div className="flex gap-2 mb-3">
                  {(['text', 'announcement', 'image'] as const).map(t => (
                    <button key={t} onClick={() => setNewPost(p => ({ ...p, type: t }))} className={['px-3 py-1.5 text-xs rounded-full font-semibold capitalize', newPost.type === t ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'].join(' ')}>
                      {t}
                    </button>
                  ))}
                </div>
                <textarea value={newPost.body} onChange={e => setNewPost(p => ({ ...p, body: e.target.value }))} placeholder="Share something with your community..." rows={3} className="w-full input-base resize-none mb-3" />
                {newPost.type === 'image' && (
                  <input value={newPost.imageUrl} onChange={e => setNewPost(p => ({ ...p, imageUrl: e.target.value }))} placeholder="Image URL" className="input-base mb-3 w-full" />
                )}
                <button onClick={createPost} className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100">Post</button>
              </div>

              <div className="space-y-4">
                {posts.map(p => (
                  <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        {p.isPinned && <span className="text-xs font-bold text-amber-500 mb-1 block">📌 Pinned</span>}
                        {p.type === 'announcement' && <span className="text-xs font-bold text-blue-500 mb-1 block">📢 Announcement</span>}
                        <p className="text-sm text-gray-700 dark:text-gray-200">{p.body}</p>
                        <p className="text-xs text-gray-400 mt-2">❤️ {p.likeCount} · 💬 {p._count.comments} · {new Date(p.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => pinPost(p.id)} className="p-1.5 text-gray-400 hover:text-amber-500 transition-colors" title="Pin/Unpin"><Star className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deletePost(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {posts.length === 0 && <p className="text-center text-sm text-gray-400 py-10">No posts yet. Share something with your community!</p>}
              </div>
            </div>
          )}

          {/* ── VERIFICATION ── */}
          {tab === 'verification' && (
            <div>
              <h1 className="text-xl font-bold mb-2">Creator Verification</h1>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Get a verified badge to build trust with your audience.</p>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 max-w-lg">
                {profile?.isVerified ? (
                  <div className="text-center py-4">
                    <BadgeCheck className="w-12 h-12 text-blue-500 mx-auto mb-3" />
                    <h2 className="font-bold text-lg">You're Verified!</h2>
                    <p className="text-sm text-gray-400 mt-1">Tier: <span className="font-semibold capitalize">{profile.verifiedTier}</span></p>
                  </div>
                ) : verification?.status === 'pending' ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-3">
                      <BadgeCheck className="w-6 h-6 text-amber-500" />
                    </div>
                    <h2 className="font-bold">Application Pending</h2>
                    <p className="text-sm text-gray-400 mt-1">Submitted {new Date(verification.submittedAt).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-400 mt-3">Our team reviews applications within 3–5 business days.</p>
                  </div>
                ) : verification?.status === 'rejected' ? (
                  <div>
                    <p className="text-sm text-red-500 mb-4">Application rejected: {verification.reviewNote}</p>
                    <button onClick={applyVerification} className="px-6 py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600">Re-apply</button>
                  </div>
                ) : (
                  <div>
                    <div className="space-y-3 mb-6">
                      {[
                        { tier: 'standard', desc: 'Basic verification for active creators', req: '100+ followers' },
                        { tier: 'trusted', desc: 'Trusted creator with consistent content', req: '1,000+ followers' },
                        { tier: 'partner', desc: 'Top-tier creator partnership', req: '10,000+ followers' },
                      ].map(t => (
                        <div key={t.tier} className={['p-4 rounded-xl border-2', followers >= parseInt(t.req) ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-800 opacity-50'].join(' ')}>
                          <div className="flex items-center gap-2 mb-1">
                            <BadgeCheck className="w-4 h-4 text-blue-500" />
                            <span className="font-semibold text-sm capitalize">{t.tier}</span>
                            <span className="text-xs text-gray-400 ml-auto">{t.req}</span>
                          </div>
                          <p className="text-xs text-gray-500">{t.desc}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mb-4">You have {followers} followers.</p>
                    <button onClick={applyVerification} disabled={followers < 100} className="w-full py-3 bg-blue-500 text-white text-sm font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
                      Apply for Verification
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SPONSORSHIP ── */}
          {tab === 'sponsorship' && (
            <div>
              <h1 className="text-xl font-bold mb-2">Sponsorship Marketplace</h1>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Create a listing so brands can find and contact you for sponsorships.</p>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 max-w-lg">
                <p className="text-sm text-gray-500 mb-4">Your audience: <strong>{followers.toLocaleString()} followers</strong></p>
                <button onClick={() => router.push('/sponsorship')} className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100">
                  Manage Sponsorship Listing →
                </button>
              </div>
            </div>
          )}

          {/* ── PROFILE / CHANNEL ── */}
          {tab === 'profile' && (
            <div>
              <h1 className="text-xl font-bold mb-6">Channel Settings</h1>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 max-w-lg space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Username</label>
                  <input value={profileForm.username} onChange={e => setProfileForm(p => ({ ...p, username: e.target.value }))} placeholder="your_username" className="input-base w-full" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Bio</label>
                  <textarea value={profileForm.bio} onChange={e => setProfileForm(p => ({ ...p, bio: e.target.value }))} placeholder="Tell your audience about yourself..." rows={3} className="input-base w-full resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Avatar URL</label>
                  <input value={profileForm.avatarUrl} onChange={e => setProfileForm(p => ({ ...p, avatarUrl: e.target.value }))} placeholder="https://..." className="input-base w-full" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Banner URL</label>
                  <input value={profileForm.bannerUrl} onChange={e => setProfileForm(p => ({ ...p, bannerUrl: e.target.value }))} placeholder="https://..." className="input-base w-full" />
                </div>
                <button onClick={saveProfile} disabled={saving} className="w-full py-3 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => router.push(`/creator/${profile?.username || userId}`)} className="w-full py-3 border border-gray-200 dark:border-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" /> View Your Channel
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx global>{`
        .input-base {
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          background: rgb(249 250 251);
          border: 1px solid rgb(229 231 235);
          border-radius: 0.75rem;
          color: rgb(17 24 39);
          outline: none;
          transition: border-color 0.15s;
        }
        .dark .input-base {
          background: rgb(17 24 39);
          border-color: rgb(55 65 81);
          color: rgb(243 244 246);
        }
        .input-base:focus {
          border-color: rgb(239 68 68);
        }
      `}</style>
    </div>
  );
}
