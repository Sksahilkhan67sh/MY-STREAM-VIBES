'use client';
export const dynamic = 'force-dynamic';

/**
 * /studio — Unified Creator Hub
 * Merges: /host (Go Live) + old /studio (Creator Dashboard) + /earnings + /billing
 *
 * Old routes redirect here:
 *   /host           → /studio          (Go Live tab)
 *   /earnings       → /studio?tab=earnings
 *   /billing        → /studio?tab=billing
 *
 * No features removed. All inline panels preserved.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
// Aliased: this file also exports a route-config constant named `dynamic`
// (see `export const dynamic = 'force-dynamic'` above), which would
// otherwise collide with the next/dynamic import.
import dynamicImport from 'next/dynamic';
import { StudioPanelSkeleton } from '@/components/ui/Skeleton';

// Stream-control components
//
// Code-splitting note: `/studio` defaults to the 'live' tab, which renders
// either StreamCreationWizard (no active stream — the common case) or
// HostControls (actively live). Both are kept as regular eager imports
// since one of them is on the critical render path for every visit.
//
// Everything else here is a secondary tab (Schedule, Replays, Thumbnail,
// Moderation, AI tools, Analytics, Earnings, Billing, Pricing, PPV,
// Payouts) that's only needed once the creator clicks into that tab, so
// each is loaded as its own chunk via next/dynamic. This previously all
// loaded eagerly regardless of which tab (if any) the creator opened,
// meaning ~300KB of source across ~15 components shipped up front. Same
// components, same props, same behavior — just fetched on demand, with
// StudioPanelSkeleton shown in the ~one network round-trip it takes to
// fetch the chunk instead of a blank panel.
import HostControls          from '@/components/HostControls';
import StreamCreationWizard  from '@/components/StreamCreationWizard';

// Generic over the component's own props (P) so each dynamic import below
// keeps its real prop types (roomId, hostToken, onClose, etc.) instead of
// collapsing to `unknown` — a non-generic version of this helper type-checks
// fine on the `dynamicImport` call itself but breaks every call site that
// passes props, since TS can no longer see what props each panel expects.
function dynamicPanel<P extends object>(loader: () => Promise<{ default: React.ComponentType<P> }>) {
  return dynamicImport(loader, { loading: () => <StudioPanelSkeleton />, ssr: false });
}

const ScheduleModal          = dynamicPanel(() => import('@/components/ScheduleModal'));
const StreamCalendar         = dynamicPanel(() => import('@/components/StreamCalendar'));
const ThumbnailUploader      = dynamicPanel(() => import('@/components/ThumbnailUploader'));
const EmailNotificationPanel = dynamicPanel(() => import('@/components/EmailNotificationPanel'));
const ReplayLibrary          = dynamicPanel(() => import('@/components/ReplayLibrary'));
const ModerationPanel        = dynamicPanel(() => import('@/components/ModerationPanel'));
const ClipCreator            = dynamicPanel(() => import('@/components/ClipCreator'));
const AITitleGenerator       = dynamicPanel(() => import('@/components/AITitleGenerator'));
const AISummaryExport        = dynamicPanel(() => import('@/components/AISummaryExport'));
const PayoutsSettings        = dynamicPanel(() => import('@/components/PayoutsSettings'));

// Business panels
const InlineAnalytics        = dynamicPanel(() => import('@/components/InlineAnalytics'));
const InlineEarnings         = dynamicPanel(() => import('@/components/InlineEarnings'));
const InlineBilling          = dynamicPanel(() => import('@/components/InlineBilling'));
const InlinePricing          = dynamicPanel(() => import('@/components/InlinePricing'));
const InlinePPV              = dynamicPanel(() => import('@/components/InlinePPV'));

// Creator-hub helpers
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useUserRole } from '@/hooks/useUserRole';

import {
  // Stream section
  Radio, Calendar, Clock, Video, Play,
  // Tools
  Image, Scissors, Shield, Mail,
  // AI
  Sparkles, FileText,
  // Business
  BarChart2, DollarSign, CreditCard, Ticket,
  // Creator hub
  BarChart3, Users, Star, ShoppingBag, MessageSquare,
  BadgeCheck, Handshake, Settings, Crown, Eye, TrendingUp,
  ExternalLink, Trash2, Check, X, Plus,
  // UI
  ChevronRight, LogOut, Menu, Zap, Wallet,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const API     = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const LS_HOST_TOKEN = (uid: string) => `sv_hostToken_${uid}`;
const LS_ROOM_ID    = (uid: string) => `sv_roomId_${uid}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardPrefs {
  moderation?: boolean; aiSummary?: boolean; autoClips?: boolean;
  recording?: boolean; captions?: boolean; superChat?: boolean;
  memberships?: boolean; ppv?: boolean; donations?: boolean;
}
interface StreamData {
  roomId: string; hostToken: string; livekitToken: string;
  viewerUrl: string; expiresAt: string; scheduledAt?: string; title?: string;
  wizardPrefs?: WizardPrefs | null;
}
interface RecentStream {
  roomId: string; title: string; isLive: boolean; createdAt: string;
  thumbnailUrl?: string; viewerCount?: number; id?: string;
  category?: { name: string; icon: string };
}
interface MembershipTier {
  id: string; name: string; description?: string; price: number;
  color: string; perks: string[]; memberCount: number;
}
interface MerchProduct {
  id: string; title: string; price: number; type: string; stock?: number;
  imageUrl?: string; externalUrl?: string; isActive: boolean;
}
interface CommunityPost {
  id: string; type: string; body: string; likeCount: number; isPinned: boolean;
  createdAt: string; _count: { comments: number };
}

// ─── Nav definition ───────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    group: 'Go Live',
    items: [
      { id: 'live',      label: 'Go Live',       icon: Radio,     accent: '#ff3520' },
      { id: 'calendar',  label: 'Schedule',       icon: Calendar,  accent: '#f59e0b' },
      { id: 'replays',   label: 'Replay Library', icon: Video,     accent: '#6366f1' },
    ],
  },
  {
    group: 'Stream Tools',
    items: [
      { id: 'thumbnail',     label: 'Thumbnail',      icon: Image,    accent: '#10b981' },
      { id: 'clips',         label: 'Clips',           icon: Scissors, accent: '#ec4899' },
      { id: 'moderation',    label: 'Moderation',      icon: Shield,   accent: '#ef4444' },
      { id: 'notifications', label: 'Email Notify',    icon: Mail,     accent: '#3b82f6' },
    ],
  },
  {
    group: 'AI',
    items: [
      { id: 'ai-title',   label: 'AI Title',   icon: Sparkles, accent: '#a855f7' },
      { id: 'ai-summary', label: 'AI Summary', icon: FileText, accent: '#ff3520' },
    ],
  },
  {
    group: 'Business',
    items: [
      { id: 'analytics', label: 'Analytics',     icon: BarChart2,  accent: '#ff3520' },
      { id: 'earnings',  label: 'Earnings',       icon: DollarSign, accent: '#22c55e' },
      { id: 'billing',   label: 'Plan & Billing', icon: CreditCard, accent: '#8b5cf6' },
      { id: 'ppv',       label: 'Pay-Per-View',   icon: Ticket,     accent: '#f59e0b' },
    ],
  },
  {
    group: 'Creator Hub',
    items: [
      { id: 'overview',      label: 'Dashboard',    icon: BarChart3,    accent: '#3b82f6' },
      { id: 'streams-list',  label: 'My Streams',   icon: Video,        accent: '#6366f1' },
      { id: 'memberships',   label: 'Memberships',  icon: Crown,        accent: '#f59e0b' },
      { id: 'merch',         label: 'Merch Store',  icon: ShoppingBag,  accent: '#10b981' },
      { id: 'community',     label: 'Community',    icon: MessageSquare,accent: '#ec4899' },
      { id: 'verification',  label: 'Verification', icon: BadgeCheck,   accent: '#3b82f6' },
      { id: 'sponsorship',   label: 'Sponsorship',  icon: Handshake,    accent: '#8b5cf6' },
      { id: 'channel',       label: 'Channel',      icon: Settings,     accent: '#71717a' },
      { id: 'payouts',       label: 'Payouts',      icon: Wallet,       accent: '#16a34a' },
    ],
  },
];

const ALL_TABS = NAV_GROUPS.flatMap(g => g.items.map(i => i.id));

// Which group a given tab id belongs to — used to auto-expand the right
// group in the (now collapsible) sidebar below.
const groupOf = (tabId: string) => NAV_GROUPS.find(g => g.items.some(i => i.id === tabId))?.group;

const STREAM_TOOL_TABS     = new Set(['thumbnail','clips','moderation','notifications','ai-title','ai-summary']);
const STREAM_REQUIRED_TABS = new Set(['analytics','ppv',...STREAM_TOOL_TABS]);

// ─── Sub-components (unchanged from original) ─────────────────────────────────

function SectionHeader({ title, subtitle, icon: Icon, accent }: {
  title: string; subtitle: string; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${accent}20`, border: `1px solid ${accent}30` }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-zinc-500 text-sm">{subtitle}</p>
      </div>
    </div>
  );
}

function NoStreamPlaceholder({ tab, onGoLive }: { tab: string; onGoLive: () => void }) {
  const LABELS: Record<string, string> = {
    thumbnail:'Upload a thumbnail', clips:'Create clips', moderation:'Moderate viewers',
    notifications:'Send email notifications', 'ai-title':'Generate AI titles',
    'ai-summary':'Generate an AI summary', analytics:'View analytics', ppv:'Set up Pay-Per-View',
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-24 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-5">
        <Zap className="w-7 h-7 text-zinc-700" />
      </div>
      <h2 className="text-white font-bold text-lg mb-2">Start a stream first</h2>
      <p className="text-zinc-500 text-sm mb-6 max-w-xs">
        {LABELS[tab] ?? 'This feature'} requires an active or recent stream.
      </p>
      <button onClick={onGoLive}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#ff3520] text-white font-semibold text-sm hover:bg-[#e02e1a] transition-colors">
        <Radio className="w-4 h-4" /> Go Live Now
      </button>
    </div>
  );
}

const TOOL_CONFIG: Record<string, { icon: React.ElementType; accent: string; title: string; subtitle: string }> = {
  thumbnail:     { icon: Image,    accent:'#10b981', title:'Thumbnail',           subtitle:'Upload a custom thumbnail for your stream' },
  clips:         { icon: Scissors, accent:'#ec4899', title:'Clips & Highlights',  subtitle:'Mark and manage stream clip highlights' },
  moderation:    { icon: Shield,   accent:'#ef4444', title:'Moderation',          subtitle:'Ban, timeout, and filter your chat' },
  notifications: { icon: Mail,     accent:'#3b82f6', title:'Email Notifications', subtitle:'Send updates and reminders to viewers' },
  'ai-title':    { icon: Sparkles, accent:'#a855f7', title:'AI Title Generator',  subtitle:'Generate optimised titles with Claude AI' },
  'ai-summary':  { icon: FileText, accent:'#ff3520', title:'AI Summary Export',   subtitle:'Auto-summarise your stream with Claude AI' },
};

function StreamToolPanel({ activeTab, stream, userId }: {
  activeTab: string;
  stream: { roomId: string; hostToken: string; title?: string };
  userId: string;
}) {
  const cfg = TOOL_CONFIG[activeTab];
  if (!cfg) return null;
  return (
    <div className="flex flex-col min-h-full">
      <div className="px-6 lg:px-8 py-6 border-b border-white/[0.06]">
        <SectionHeader title={cfg.title} subtitle={cfg.subtitle} icon={cfg.icon} accent={cfg.accent} />
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
          Stream: <span className="text-zinc-400 font-medium ml-1">{stream.title ?? stream.roomId}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl">
          {activeTab === 'thumbnail'     && <ThumbnailUploader      roomId={stream.roomId} hostToken={stream.hostToken} />}
          {activeTab === 'clips'         && <ClipCreator            roomId={stream.roomId} hostToken={stream.hostToken} />}
          {activeTab === 'moderation'    && <ModerationPanel        roomId={stream.roomId} hostToken={stream.hostToken} userId={userId} />}
          {activeTab === 'notifications' && <EmailNotificationPanel  roomId={stream.roomId} hostToken={stream.hostToken} streamTitle={stream.title ?? ''} />}
          {activeTab === 'ai-title'      && <AITitleGenerator       roomId={stream.roomId} hostToken={stream.hostToken} currentTitle={stream.title ?? ''} />}
          {activeTab === 'ai-summary'    && <AISummaryExport        roomId={stream.roomId} hostToken={stream.hostToken} streamTitle={stream.title ?? ''} />}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: any; color: string;
}) {
  return (
    <div className="bg-white/[0.04] rounded-2xl p-5 border border-white/[0.07]">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3`}
        style={{ background: color + '30' }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function StudioInner() {
  const { data: session, status } = useSession();
  const router      = useRouter();
  const searchParams = useSearchParams();

  // Determine initial tab from ?tab= query param (supports redirect from /earnings, /billing)
  const initialTab = (() => {
    const t = searchParams.get('tab');
    return t && ALL_TABS.includes(t) ? t : 'live';
  })();

  const [activeTab, setActiveTab]           = useState(initialTab);
  // Sidebar restructure: 22 flat nav items across 5 groups were all shown
  // at once (the exact "too much at a glance" clutter problem the UX brief
  // flags). Groups are now collapsible accordions — only the group
  // containing the current tab starts expanded. Switching tabs (from
  // anywhere: sidebar clicks, "Go to Analytics" buttons elsewhere in the
  // page, etc.) auto-expands that tab's group via the effect below, so the
  // active item is never hidden inside a collapsed section.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(groupOf(initialTab) ? [groupOf(initialTab) as string] : [])
  );
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [stream, setStream]                 = useState<StreamData | null>(null);
  const [title, setTitle]                   = useState('');
  const [password, setPassword]             = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [copied, setCopied]                 = useState(false);
  const [mode, setMode]                     = useState<'live'|'scheduled'>('live');
  const [showSchedule, setShowSchedule]     = useState(false);
  const [scheduledAt, setScheduledAt]       = useState<string|null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isPublic, setIsPublic]             = useState(false);
  const [categoryId, setCategoryId]         = useState('');
  const [categories, setCategories]         = useState<{ id:string; name:string; icon:string }[]>([]);
  const [recentStreams, setRecentStreams]    = useState<RecentStream[]>([]);
  const [savedHostToken, setSavedHostToken] = useState('');
  const [savedRoomId, setSavedRoomId]       = useState('');

  // Creator Hub state
  const [followers, setFollowers]     = useState(0);
  const [tiers, setTiers]             = useState<MembershipTier[]>([]);
  const [products, setProducts]       = useState<MerchProduct[]>([]);
  const [posts, setPosts]             = useState<CommunityPost[]>([]);
  const [verification, setVerification] = useState<any>(null);
  const [profile, setProfile]         = useState<any>(null);
  const [hubLoading, setHubLoading]   = useState(false);

  // Creator hub form states
  const [newTier, setNewTier]         = useState({ name:'', description:'', price:'', color:'#6366f1', perks:'' });
  const [newProduct, setNewProduct]   = useState({ title:'', description:'', price:'', type:'physical', externalUrl:'', stock:'' });
  const [newPost, setNewPost]         = useState({ type:'text', body:'', imageUrl:'' });
  const [profileForm, setProfileForm] = useState({ username:'', bio:'', avatarUrl:'', bannerUrl:'' });
  const [saving, setSaving]           = useState(false);
  const [toastMsg, setToastMsg]       = useState('');

  const userId = session?.user?.id ?? session?.user?.email ?? '';
  const { role, hasSelectedRole, hasChannel, loading: roleLoading, error: roleError, refetch: refetchRole } = useUserRole();

  const toast = (m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 3000); };

  // Keep the active tab's sidebar group expanded no matter how activeTab
  // changed (sidebar click, a "Back to Analytics" button elsewhere on the
  // page, the ?tab= query param, etc.) — otherwise switching tabs from
  // outside the sidebar could leave the active item buried in a collapsed
  // group with no visual indication of where you are.
  useEffect(() => {
    const g = groupOf(activeTab);
    if (g) setExpandedGroups(prev => (prev.has(g) ? prev : new Set(prev).add(g)));
  }, [activeTab]);

  // ── Restore stream + tokens on mount ──
  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    try {
      const saved = sessionStorage.getItem('activeStream');
      if (saved) {
        const parsed: StreamData = JSON.parse(saved);
        if (parsed.expiresAt && new Date(parsed.expiresAt) > new Date()) {
          setStream(parsed);
        } else { sessionStorage.removeItem('activeStream'); }
      }
    } catch { sessionStorage.removeItem('activeStream'); }

    const lsToken  = localStorage.getItem(LS_HOST_TOKEN(userId)) ?? '';
    const lsRoomId = localStorage.getItem(LS_ROOM_ID(userId))    ?? '';
    setSavedHostToken(lsToken);
    setSavedRoomId(lsRoomId);

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_success') === '1') {
      setPaymentSuccess(true);
      window.history.replaceState({}, '', '/studio');
      setTimeout(() => setPaymentSuccess(false), 5000);
    }
  }, [status, userId]);

  // ── Load recent streams ──
  useEffect(() => {
    if (status !== 'authenticated' || !userId) return;
    fetch(`${API}/api/streams?userId=${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : { streams: [] })
      .then(d => setRecentStreams((d.streams ?? []).slice(0, 5)))
      .catch(() => {});
  }, [status, userId]);

  // ── Load categories ──
  useEffect(() => {
    fetch(`${API}/api/discover/categories`)
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(d => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  // ── Load payout status (for the Stream Creation Wizard's Monetization step) ──
  const [payoutStatus, setPayoutStatus] = useState<{ stripeConnected: boolean; razorpayConnected: boolean; upiConnected: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/api/donations/config/by-user/${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setPayoutStatus(d))
      .catch(() => setPayoutStatus({ stripeConnected: false, razorpayConnected: false, upiConnected: false }));
  }, [userId]);

  // ── Load creator hub data lazily (only when a hub tab is active) ──
  const HUB_TABS = new Set(['overview','streams-list','memberships','merch','community','verification','sponsorship','channel','payouts']);
  useEffect(() => {
    if (!userId || !HUB_TABS.has(activeTab)) return;
    if (profile) return; // already loaded
    setHubLoading(true);
    Promise.all([
      fetch(`${API}/api/streams?userId=${encodeURIComponent(userId)}`).then(r => r.json()),
      apiGet<any>(`/api/creators/${userId}`),
      apiGet<any>(`/api/verification/${userId}`),
      apiGet<{ tiers: MembershipTier[] }>(`/api/memberships/tiers/${userId}`),
      apiGet<{ products: MerchProduct[] }>(`/api/merch/${userId}`),
      apiGet<{ posts: CommunityPost[] }>(`/api/community/${userId}/posts`),
    ]).then(([streamsData, creatorData, verif, tiersData, merchData, postsData]) => {
      setFollowers(creatorData.followerCount ?? 0);
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
    }).catch(() => {}).finally(() => setHubLoading(false));
  }, [userId, activeTab]);

  // ── Auth guard ──
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // ── Role guard: VIEWER → onboarding (if never chosen) or /become-creator ──
  // CREATOR/ADMIN without a channel yet (no username set) → /create-channel.
  // This is the studio-access rule: role === CREATOR AND a channel exists.
  useEffect(() => {
    if (status !== 'authenticated' || roleLoading || roleError) return;
    if (!hasSelectedRole) { router.replace('/onboarding'); return; }
    if (role === 'VIEWER') { router.replace('/become-creator'); return; }
    if (!hasChannel) { router.replace('/create-channel'); return; }
  }, [status, roleLoading, roleError, hasSelectedRole, role, hasChannel, router]);

  if (status === 'loading' || status === 'unauthenticated' || roleLoading) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    );
  }

  // Role lookup failed and we have no cached role to fall back on — show a
  // retry state instead of redirect-looping into onboarding.
  if (roleError && !role) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4">
        <div className="text-center max-w-xs">
          <p className="text-zinc-400 text-sm mb-4">Couldn&apos;t load your account. Please check your connection and try again.</p>
          <button onClick={() => refetchRole()} className="px-5 py-2.5 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!hasSelectedRole || role === 'VIEWER' || !hasChannel) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    );
  }

  // ── Best tokens ──
  const bestHostToken = stream?.hostToken || savedHostToken;
  const bestRoomId    = stream?.roomId    || savedRoomId || (recentStreams[0]?.roomId ?? '');
  const toolStream    = stream
    ? { roomId: stream.roomId, hostToken: stream.hostToken, title: stream.title }
    : savedRoomId && savedHostToken
      ? { roomId: savedRoomId, hostToken: savedHostToken, title: recentStreams[0]?.title ?? '' }
      : recentStreams[0]
        ? { roomId: recentStreams[0].roomId, hostToken: savedHostToken, title: recentStreams[0].title }
        : null;

  // ── Create stream ──
  const createStream = async (overrideScheduledAt?: string) => {
    if (!title.trim()) { setError('Enter a stream title'); return; }
    setError(''); setLoading(true);
    try {
      const effectiveSchedule = overrideScheduledAt ?? scheduledAt;
      const body: Record<string,unknown> = {
        title: title.trim(), password: password || undefined,
        userId: userId || undefined,
        categoryId: isPublic ? (categoryId || undefined) : undefined,
        isPublic,
      };
      if (effectiveSchedule) body.scheduledAt = effectiveSchedule;

      const res  = await fetch(`${API}/api/streams`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create stream'); return; }

      const newStream: StreamData = { ...data, scheduledAt: effectiveSchedule ?? undefined, title: title.trim() };
      sessionStorage.setItem('activeStream', JSON.stringify(newStream));

      if (userId) {
        localStorage.setItem(LS_HOST_TOKEN(userId), newStream.hostToken);
        localStorage.setItem(LS_ROOM_ID(userId),    newStream.roomId);
        setSavedHostToken(newStream.hostToken);
        setSavedRoomId(newStream.roomId);
      }
      setStream(newStream);
      setActiveTab('live');
    } catch { setError('Cannot connect to server. Is it running?'); }
    finally { setLoading(false); }
  };

  // ── If active stream + live tab → show HostControls ──
  if (stream && activeTab === 'live') {
    return (
      <>
        <AnimatePresence>
          {paymentSuccess && (
            <motion.div
              initial={{ opacity:0, y:-40 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-40 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl bg-green-500 text-white">
              <span>🎉</span><p className="text-sm font-bold">Subscription activated!</p>
            </motion.div>
          )}
        </AnimatePresence>
        <HostControls
          stream={stream} appUrl={APP_URL}
          onCopy={() => { navigator.clipboard.writeText(`${APP_URL}${stream.viewerUrl}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          copied={copied}
        />
      </>
    );
  }

  // ── Creator hub actions ──
  const createTier = async () => {
    if (!newTier.name || !newTier.price) return;
    try {
      const t = await apiPost<MembershipTier>('/api/memberships/tiers', {
        creatorId: userId, name: newTier.name, description: newTier.description,
        price: parseInt(newTier.price) * 100, color: newTier.color,
        perks: newTier.perks.split('\n').filter(Boolean),
      });
      setTiers(prev => [...prev, t]);
      setNewTier({ name:'', description:'', price:'', color:'#6366f1', perks:'' });
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
      setNewProduct({ title:'', description:'', price:'', type:'physical', externalUrl:'', stock:'' });
      toast('Product added!');
    } catch { toast('Failed to add product'); }
  };

  const createPost = async () => {
    if (!newPost.body) return;
    try {
      const p = await apiPost<any>('/api/community/posts', { userId, ...newPost });
      setPosts(prev => [p, ...prev]);
      setNewPost({ type:'text', body:'', imageUrl:'' });
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
      toast('Application submitted!');
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

  const parsedSchedule   = scheduledAt ? new Date(scheduledAt) : null;
  const userName  = session?.user?.name ?? session?.user?.email ?? 'Creator';
  const userImage = session?.user?.image ?? null;

  // ── Sidebar nav ──
  const NavItem = ({ item }: { item: typeof NAV_GROUPS[0]['items'][0] }) => {
    const Icon     = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
        className={[
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-0.5',
          isActive ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]',
        ].join(' ')}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: isActive ? `${item.accent}20` : 'transparent' }}>
          <Icon className="w-3.5 h-3.5" style={{ color: isActive ? item.accent : 'currentColor' }} />
        </div>
        <span className="flex-1 text-left">{item.label}</span>
        {isActive && <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#070707] flex" style={{ fontFamily:"'DM Sans','Inter',sans-serif" }}>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside className={[
        'fixed lg:relative inset-y-0 left-0 z-50 w-64',
        'bg-[#0d0d0d] border-r border-white/[0.06] flex flex-col',
        'transition-transform duration-300 ease-out',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}>

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.06]">
          <a href="/feed" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
            <span className="font-bold text-white text-base tracking-tight">StreamVault</span>
          </a>
          <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="lg:hidden text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav groups — collapsible; only the group containing activeTab
            starts expanded (see expandedGroups state above). Cuts the
            sidebar from 22 always-visible items down to ~4-5 at a glance,
            while the active tab is always reachable in one click since its
            group auto-expands. */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV_GROUPS.map(group => {
            const isOpen = expandedGroups.has(group.group);
            return (
              <div key={group.group} className="mb-2">
                <button
                  onClick={() => setExpandedGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(group.group)) next.delete(group.group); else next.add(group.group);
                    return next;
                  })}
                  className="w-full flex items-center justify-between px-3 py-1.5 mb-1 group"
                  aria-expanded={isOpen}
                >
                  <span className="text-[10px] font-bold text-zinc-600 group-hover:text-zinc-400 uppercase tracking-widest transition-colors">
                    {group.group}
                  </span>
                  <ChevronRight
                    className={`w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      {group.items.map(item => <NavItem key={item.id} item={item} />)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-white/[0.06]">
          {stream && (
            <button
              onClick={() => setActiveTab('live')}
              className="w-full flex items-center gap-2.5 p-3 rounded-xl bg-[#ff3520]/10 border border-[#ff3520]/20 mb-3 hover:bg-[#ff3520]/15 transition-colors text-left"
            >
              <div className="w-2 h-2 rounded-full bg-[#ff3520] animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{stream.title ?? 'Live stream'}</p>
                <p className="text-[#ff3520] text-[10px] font-semibold">LIVE · Click to return</p>
              </div>
            </button>
          )}
          <div className="flex items-center gap-3">
            {userImage
              ? <img src={userImage} alt="" className="w-8 h-8 rounded-full border border-white/10 flex-shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-[#ff3520]/20 border border-[#ff3520]/30 flex items-center justify-center text-[#ff3520] text-sm font-bold flex-shrink-0">
                  {userName[0]?.toUpperCase()}
                </div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{userName}</p>
              <p className="text-zinc-600 text-[10px] truncate">{session?.user?.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl:'/login' })}
              title="Sign out"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-white hover:bg-white/10 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06] text-center">
            <p className="text-zinc-600 text-[10px]">Stream Vault · Version 1.0</p>
            <p className="text-zinc-700 text-[10px]">Creator Platform by Aligncraft</p>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06] bg-[#0d0d0d]">
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="text-zinc-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />
            <span className="text-white font-bold text-sm">Studio</span>
          </div>
          {stream
            ? <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#ff3520]/20 border border-[#ff3520]/30">
                <div className="w-1.5 h-1.5 rounded-full bg-[#ff3520] animate-pulse" />
                <span className="text-[#ff3520] text-[10px] font-bold">LIVE</span>
              </div>
            : <div className="w-8" />
          }
        </div>

        {/* Toast */}
        <AnimatePresence>
          {toastMsg && (
            <motion.div
              initial={{ opacity:0, y:-30 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-30 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl bg-white text-gray-900 text-sm font-bold shadow-2xl"
            >
              {toastMsg}
            </motion.div>
          )}
          {paymentSuccess && (
            <motion.div
              initial={{ opacity:0, y:-40 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-40 }}
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl bg-green-500 text-white"
            >
              <span>🎉</span><p className="text-sm font-bold">Subscription activated!</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Go Live button — mobile only, matches the brief's
            "Floating Go Live Button" ask for the creator experience.
            Studio already has its own drawer nav (the hamburger + slide-out
            sidebar above) so this isn't a bottom nav bar — just a quick
            shortcut back to the Go Live tab, hidden once you're already
            there so it doesn't sit on top of the wizard/HostControls UI. */}
        {activeTab !== 'live' && (
          <button
            onClick={() => setActiveTab('live')}
            aria-label="Go live"
            className="lg:hidden fixed bottom-5 right-5 z-50 flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full bg-[#ff3520] text-white text-sm font-bold shadow-[0_8px_24px_rgba(255,53,32,0.4)] active:scale-95 transition-transform"
          >
            <Radio className="w-4 h-4" />
            Go Live
          </button>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
              transition={{ duration:0.15 }}
              className="min-h-full"
            >

              {/* ══ GO LIVE ══ */}
              {activeTab === 'live' && (
                <StreamCreationWizard
                  userId={userId}
                  password={password}
                  onPasswordChange={setPassword}
                  categories={categories}
                  payoutStatus={payoutStatus}
                  onCreated={(created, wizardData) => {
                    const newStream: StreamData = {
                      ...created,
                      title: wizardData.title.trim(),
                      scheduledAt: (wizardData.scheduleEnabled && wizardData.scheduledAt) ? wizardData.scheduledAt : undefined,
                    };
                    setStream(newStream);
                    setTitle(wizardData.title.trim());
                    try { sessionStorage.setItem('sv_stream', JSON.stringify(newStream)); } catch {}
                  }}
                />
              )}

              {/* ══ SCHEDULE / CALENDAR ══ */}
              {activeTab === 'calendar' && (
                <div className="p-6 lg:p-8">
                  <SectionHeader title="Schedule" subtitle="Plan and manage your upcoming streams" icon={Calendar} accent="#f59e0b" />
                  <div className="mt-6">
                    <StreamCalendar
                      userId={userId}
                      onClose={() => setActiveTab('live')}
                      onCreateScheduled={(dt) => { setScheduledAt(dt); setMode('scheduled'); setActiveTab('live'); }}
                      inline
                    />
                  </div>
                </div>
              )}

              {/* ══ REPLAY LIBRARY ══ */}
              {activeTab === 'replays' && (
                <ReplayLibrary userId={userId} onClose={() => setActiveTab('live')} inline />
              )}

              {/* ══ STREAM TOOL PANELS ══ */}
              {STREAM_TOOL_TABS.has(activeTab) && (
                toolStream
                  ? <StreamToolPanel activeTab={activeTab} stream={toolStream} userId={userId} />
                  : <NoStreamPlaceholder tab={activeTab} onGoLive={() => setActiveTab('live')} />
              )}

              {/* ══ ANALYTICS ══ */}
              {activeTab === 'analytics' && (
                bestHostToken && bestRoomId
                  ? <InlineAnalytics roomId={bestRoomId} hostToken={bestHostToken} onBack={() => setActiveTab('live')} />
                  : <NoStreamPlaceholder tab="analytics" onGoLive={() => setActiveTab('live')} />
              )}

              {/* ══ EARNINGS ══ */}
              {activeTab === 'earnings' && (
                <InlineEarnings hostToken={bestHostToken} onBack={() => setActiveTab('live')} />
              )}

              {/* ══ BILLING ══ */}
              {activeTab === 'billing' && (
                <InlineBilling hostToken={bestHostToken} onBack={() => setActiveTab('live')} onUpgrade={() => setActiveTab('pricing')} />
              )}

              {/* ══ PRICING ══ */}
              {activeTab === 'pricing' && (
                <InlinePricing hostToken={bestHostToken} onBack={() => setActiveTab('billing')} onSuccess={() => setActiveTab('billing')} />
              )}

              {/* ══ PAY-PER-VIEW ══ */}
              {activeTab === 'ppv' && (
                bestHostToken && bestRoomId
                  ? <InlinePPV roomId={bestRoomId} hostToken={bestHostToken} onBack={() => setActiveTab('live')} />
                  : <NoStreamPlaceholder tab="ppv" onGoLive={() => setActiveTab('live')} />
              )}

              {/* ══════════════════════════════
                   CREATOR HUB TABS
                  ══════════════════════════════ */}

              {HUB_TABS.has(activeTab) && hubLoading && (
                <div className="flex items-center justify-center py-24">
                  <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
                </div>
              )}

              {/* ══ OVERVIEW / DASHBOARD ══ */}
              {activeTab === 'overview' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <h1 className="text-xl font-bold text-white mb-6">Dashboard</h1>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard label="Total Followers"  value={followers.toLocaleString()}                           icon={Users}  color="#3b82f6" />
                    <StatCard label="Live Streams"     value={recentStreams.filter(s => s.isLive).length}           icon={Video}  color="#ff3520" />
                    <StatCard label="Total Streams"    value={recentStreams.length}                                  icon={Eye}    color="#8b5cf6" />
                    <StatCard label="Active Members"   value={tiers.reduce((s,t) => s + t.memberCount, 0)}          icon={Crown}  color="#f59e0b" />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.07]">
                      <h2 className="font-semibold text-sm text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#ff3520]" /> Recent Streams
                      </h2>
                      {recentStreams.slice(0,5).map(s => (
                        <div key={s.roomId} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
                          <div className="w-12 h-8 rounded bg-white/[0.05] flex items-center justify-center text-xs overflow-hidden">
                            {s.thumbnailUrl ? <img src={s.thumbnailUrl} alt="" className="w-full h-full object-cover" /> : '📺'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-white truncate">{s.title}</p>
                            <p className="text-[10px] text-zinc-500">{s.viewerCount ?? 0} viewers</p>
                          </div>
                          {s.isLive && <span className="text-[10px] font-bold text-[#ff3520] bg-[#ff3520]/10 px-1.5 py-0.5 rounded">LIVE</span>}
                        </div>
                      ))}
                      {recentStreams.length === 0 && <p className="text-sm text-zinc-600 py-4 text-center">No streams yet — go live to start!</p>}
                    </div>
                    <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.07]">
                      <h2 className="font-semibold text-sm text-white mb-4 flex items-center gap-2">
                        <Crown className="w-4 h-4 text-[#f59e0b]" /> Membership Tiers
                      </h2>
                      {tiers.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-sm text-zinc-500 mb-3">No membership tiers yet</p>
                          <button onClick={() => setActiveTab('memberships')} className="text-xs text-[#ff3520] font-medium hover:underline">Create your first tier →</button>
                        </div>
                      ) : tiers.map(t => (
                        <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white">{t.name}</p>
                            <p className="text-[10px] text-zinc-500">₹{(t.price/100).toFixed(0)}/month · {t.memberCount} members</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ MY STREAMS ══ */}
              {activeTab === 'streams-list' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl font-bold text-white">Your Streams</h1>
                    <button onClick={() => setActiveTab('live')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">
                      <Plus className="w-4 h-4" /> New Stream
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentStreams.map(s => (
                      <div key={s.roomId} className="bg-white/[0.03] rounded-2xl border border-white/[0.07] overflow-hidden">
                        <div className="aspect-video bg-white/[0.05] relative">
                          {s.thumbnailUrl
                            ? <img src={s.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-2xl">📺</div>
                          }
                          {s.isLive && <span className="absolute top-2 left-2 bg-[#ff3520] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">LIVE</span>}
                        </div>
                        <div className="p-4">
                          <p className="font-semibold text-sm text-white truncate mb-1">{s.title}</p>
                          <p className="text-xs text-zinc-500">{s.viewerCount ?? 0} viewers · {new Date(s.createdAt).toLocaleDateString()}</p>
                          <div className="flex gap-2 mt-3">
                            <a href={`/dashboard/${s.roomId}`} className="flex-1 py-1.5 text-xs font-semibold text-center border border-white/[0.10] rounded-lg hover:bg-white/[0.05] text-zinc-300">Manage</a>
                            <a href={`/s/${s.roomId}`} className="flex-1 py-1.5 text-xs font-semibold text-center bg-white text-black rounded-lg hover:bg-zinc-200">View</a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {recentStreams.length === 0 && (
                    <div className="text-center py-20">
                      <p className="text-zinc-500 mb-4">You haven&apos;t streamed yet.</p>
                      <button onClick={() => setActiveTab('live')} className="px-6 py-3 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">Start your first stream →</button>
                    </div>
                  )}
                </div>
              )}

              {/* ══ MEMBERSHIPS ══ */}
              {activeTab === 'memberships' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <h1 className="text-xl font-bold text-white mb-2">Membership Tiers</h1>
                  <p className="text-sm text-zinc-500 mb-6">Create monthly membership tiers for your most dedicated fans.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {tiers.map(t => (
                      <div key={t.id} className="bg-white/[0.03] rounded-2xl border-2 p-5" style={{ borderColor: t.color }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: t.color }} />
                          <h3 className="font-bold text-white">{t.name}</h3>
                        </div>
                        <p className="text-2xl font-bold text-white mb-1">₹{(t.price/100).toFixed(0)}<span className="text-sm font-normal text-zinc-500">/mo</span></p>
                        <p className="text-xs text-zinc-500 mb-3">{t.memberCount} members</p>
                        <ul className="space-y-1">
                          {t.perks.map((p, i) => <li key={i} className="text-xs text-zinc-400 flex items-center gap-1.5"><Check className="w-3 h-3 text-green-500" />{p}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-6">
                    <h2 className="font-semibold text-white mb-4">Create New Tier</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input value={newTier.name} onChange={e => setNewTier(p => ({...p,name:e.target.value}))} placeholder="Tier name (e.g. Gold)" className="hub-input" />
                      <input value={newTier.price} onChange={e => setNewTier(p => ({...p,price:e.target.value}))} placeholder="Price (₹/month)" type="number" className="hub-input" />
                      <input value={newTier.description} onChange={e => setNewTier(p => ({...p,description:e.target.value}))} placeholder="Short description" className="hub-input sm:col-span-2" />
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-zinc-400">Color:</label>
                        <input type="color" value={newTier.color} onChange={e => setNewTier(p => ({...p,color:e.target.value}))} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      </div>
                      <textarea value={newTier.perks} onChange={e => setNewTier(p => ({...p,perks:e.target.value}))} placeholder={"Perks (one per line)\nEarly access to streams\nMembers-only badge"} rows={4} className="hub-input sm:col-span-2 resize-none" />
                    </div>
                    <button onClick={createTier} className="mt-4 px-6 py-2.5 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">Create Tier</button>
                  </div>
                </div>
              )}

              {/* ══ MERCH ══ */}
              {activeTab === 'merch' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <h1 className="text-xl font-bold text-white mb-2">Merch Store</h1>
                  <p className="text-sm text-zinc-500 mb-6">List products from external stores or digital downloads.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {products.map(p => (
                      <div key={p.id} className="bg-white/[0.03] rounded-2xl border border-white/[0.07] overflow-hidden">
                        <div className="aspect-square bg-white/[0.05] flex items-center justify-center text-4xl">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" /> : (p.type === 'digital' ? '📁' : '👕')}
                        </div>
                        <div className="p-4">
                          <p className="font-semibold text-sm text-white">{p.title}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{p.type} · ₹{(p.price/100).toFixed(0)}</p>
                          {p.externalUrl && (
                            <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:underline">
                              <ExternalLink className="w-3 h-3" /> Visit store
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-6">
                    <h2 className="font-semibold text-white mb-4">Add Product</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input value={newProduct.title} onChange={e => setNewProduct(p => ({...p,title:e.target.value}))} placeholder="Product title" className="hub-input" />
                      <input value={newProduct.price} onChange={e => setNewProduct(p => ({...p,price:e.target.value}))} placeholder="Price (₹)" type="number" className="hub-input" />
                      <select value={newProduct.type} onChange={e => setNewProduct(p => ({...p,type:e.target.value}))} className="hub-input">
                        <option value="physical">Physical</option>
                        <option value="digital">Digital</option>
                      </select>
                      <input value={newProduct.stock} onChange={e => setNewProduct(p => ({...p,stock:e.target.value}))} placeholder="Stock (blank = unlimited)" type="number" className="hub-input" />
                      <input value={newProduct.externalUrl} onChange={e => setNewProduct(p => ({...p,externalUrl:e.target.value}))} placeholder="External store URL" className="hub-input sm:col-span-2" />
                    </div>
                    <button onClick={createProduct} className="mt-4 px-6 py-2.5 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">Add Product</button>
                  </div>
                </div>
              )}

              {/* ══ COMMUNITY ══ */}
              {activeTab === 'community' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <h1 className="text-xl font-bold text-white mb-6">Community Posts</h1>
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5 mb-6">
                    <div className="flex gap-2 mb-3">
                      {(['text','announcement','image'] as const).map(t => (
                        <button key={t} onClick={() => setNewPost(p => ({...p,type:t}))}
                          className={['px-3 py-1.5 text-xs rounded-full font-semibold capitalize',
                            newPost.type === t ? 'bg-white text-black' : 'bg-white/[0.05] text-zinc-400'].join(' ')}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <textarea value={newPost.body} onChange={e => setNewPost(p => ({...p,body:e.target.value}))}
                      placeholder="Share something with your community..." rows={3}
                      className="w-full hub-input resize-none mb-3" />
                    {newPost.type === 'image' && (
                      <input value={newPost.imageUrl} onChange={e => setNewPost(p => ({...p,imageUrl:e.target.value}))} placeholder="Image URL" className="hub-input mb-3 w-full" />
                    )}
                    <button onClick={createPost} className="px-5 py-2 bg-white text-black text-sm font-semibold rounded-xl hover:bg-zinc-200">Post</button>
                  </div>
                  <div className="space-y-4">
                    {posts.map(p => (
                      <div key={p.id} className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {p.isPinned && <span className="text-xs font-bold text-amber-400 mb-1 block">📌 Pinned</span>}
                            {p.type === 'announcement' && <span className="text-xs font-bold text-blue-400 mb-1 block">📢 Announcement</span>}
                            <p className="text-sm text-zinc-300">{p.body}</p>
                            <p className="text-xs text-zinc-600 mt-2">❤️ {p.likeCount} · 💬 {p._count.comments} · {new Date(p.createdAt).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => pinPost(p.id)} className="p-1.5 text-zinc-500 hover:text-amber-400 transition-colors"><Star className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deletePost(p.id)} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {posts.length === 0 && <p className="text-center text-sm text-zinc-600 py-10">No posts yet. Share something with your community!</p>}
                  </div>
                </div>
              )}

              {/* ══ VERIFICATION ══ */}
              {activeTab === 'verification' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <h1 className="text-xl font-bold text-white mb-2">Creator Verification</h1>
                  <p className="text-sm text-zinc-500 mb-6">Get a verified badge to build trust with your audience.</p>
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-6 max-w-lg">
                    {profile?.isVerified ? (
                      <div className="text-center py-4">
                        <BadgeCheck className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                        <h2 className="font-bold text-lg text-white">You&apos;re Verified!</h2>
                        <p className="text-sm text-zinc-400 mt-1">Tier: <span className="font-semibold capitalize">{profile.verifiedTier}</span></p>
                      </div>
                    ) : verification?.status === 'pending' ? (
                      <div className="text-center py-4">
                        <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-3">
                          <BadgeCheck className="w-6 h-6 text-amber-400" />
                        </div>
                        <h2 className="font-bold text-white">Application Pending</h2>
                        <p className="text-sm text-zinc-400 mt-1">Submitted {new Date(verification.submittedAt).toLocaleDateString()}</p>
                        <p className="text-xs text-zinc-500 mt-3">Our team reviews applications within 3–5 business days.</p>
                      </div>
                    ) : verification?.status === 'rejected' ? (
                      <div>
                        <p className="text-sm text-red-400 mb-4">Application rejected: {verification.reviewNote}</p>
                        <button onClick={applyVerification} className="px-6 py-2.5 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a]">Re-apply</button>
                      </div>
                    ) : (
                      <div>
                        <div className="space-y-3 mb-6">
                          {[
                            { tier:'standard', desc:'Basic verification for active creators', req:'100+ followers', min:100 },
                            { tier:'trusted',  desc:'Trusted creator with consistent content',  req:'1,000+ followers', min:1000 },
                            { tier:'partner',  desc:'Top-tier creator partnership',              req:'10,000+ followers', min:10000 },
                          ].map(t => (
                            <div key={t.tier} className={['p-4 rounded-xl border-2', followers >= t.min ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/[0.06] opacity-50'].join(' ')}>
                              <div className="flex items-center gap-2 mb-1">
                                <BadgeCheck className="w-4 h-4 text-blue-400" />
                                <span className="font-semibold text-sm text-white capitalize">{t.tier}</span>
                                <span className="text-xs text-zinc-500 ml-auto">{t.req}</span>
                              </div>
                              <p className="text-xs text-zinc-500">{t.desc}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-zinc-500 mb-4">You have {followers} followers.</p>
                        <button onClick={applyVerification} disabled={followers < 100}
                          className="w-full py-3 bg-blue-500 text-white text-sm font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed">
                          Apply for Verification
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══ SPONSORSHIP ══ */}
              {activeTab === 'sponsorship' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <h1 className="text-xl font-bold text-white mb-2">Sponsorship Marketplace</h1>
                  <p className="text-sm text-zinc-500 mb-6">Create a listing so brands can find and contact you.</p>
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-6 max-w-lg">
                    <p className="text-sm text-zinc-400 mb-4">Your audience: <strong className="text-white">{followers.toLocaleString()} followers</strong></p>
                    <a href="/sponsorship" className="flex items-center justify-center gap-2 w-full py-3 bg-white text-black text-sm font-semibold rounded-xl hover:bg-zinc-200">
                      Manage Sponsorship Listing <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}

              {/* ══ CHANNEL SETTINGS ══ */}
              {activeTab === 'channel' && !hubLoading && (
                <div className="p-6 lg:p-8">
                  <h1 className="text-xl font-bold text-white mb-6">Channel Settings</h1>
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-6 max-w-lg space-y-4">
                    {[
                      { key:'username', label:'Username', placeholder:'your_username', multiline:false },
                      { key:'avatarUrl', label:'Avatar URL', placeholder:'https://...', multiline:false },
                      { key:'bannerUrl', label:'Banner URL', placeholder:'https://...', multiline:false },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">{f.label}</label>
                        <input
                          value={(profileForm as any)[f.key]}
                          onChange={e => setProfileForm(p => ({...p,[f.key]:e.target.value}))}
                          placeholder={f.placeholder}
                          className="hub-input w-full"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Bio</label>
                      <textarea
                        value={profileForm.bio}
                        onChange={e => setProfileForm(p => ({...p,bio:e.target.value}))}
                        placeholder="Tell your audience about yourself..."
                        rows={3}
                        className="hub-input w-full resize-none"
                      />
                    </div>
                    <button onClick={saveProfile} disabled={saving}
                      className="w-full py-3 bg-[#ff3520] text-white text-sm font-semibold rounded-xl hover:bg-[#e02e1a] disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    {profile?.username && (
                      <a href={`/creator/${profile.username || userId}`}
                        className="flex items-center justify-center gap-2 w-full py-3 border border-white/[0.10] text-sm font-semibold rounded-xl hover:bg-white/[0.04] text-zinc-300">
                        <ExternalLink className="w-4 h-4" /> View Your Channel
                      </a>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'payouts' && !hubLoading && (
                <PayoutsSettings userId={userId} />
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Schedule modal */}
      <AnimatePresence>
        {showSchedule && (
          <ScheduleModal
            title={title}
            onClose={() => setShowSchedule(false)}
            onSchedule={(datetime) => { setScheduledAt(datetime); setShowSchedule(false); createStream(datetime); }}
          />
        )}
      </AnimatePresence>

      <style jsx global>{`
        .hub-input {
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.75rem;
          color: #f4f4f5;
          outline: none;
          transition: border-color 0.15s;
        }
        .hub-input:focus {
          border-color: rgba(255,53,32,0.5);
        }
        .hub-input::placeholder {
          color: #52525b;
        }
      `}</style>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function StudioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    }>
      <StudioInner />
    </Suspense>
  );
}
