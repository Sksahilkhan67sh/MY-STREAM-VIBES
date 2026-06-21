'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, ChevronLeft, ChevronRight, Upload, Loader2, Sparkles, Radio,
  Lock, Globe, Eye, EyeOff, Shield, Captions, Video, Scissors, FileText,
  MessageSquare, Crown, Ticket, Heart, Gift, Bell, Megaphone, Clock,
  CreditCard, Wallet, IndianRupee, X, Calendar,
} from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ── Types ───────────────────────────────────────────────────────────────────
export interface WizardData {
  // Step 1
  title: string;
  description: string;
  thumbnailUrl: string;
  categoryId: string;
  tags: string[];
  // Step 2
  moderation: boolean;
  aiSummary: boolean;
  autoClips: boolean;
  recording: boolean;
  captions: boolean;
  visibility: 'public' | 'private' | 'unlisted';
  // Step 3
  superChat: boolean;
  memberships: boolean;
  ppv: boolean;
  ppvPrice: string;
  donations: boolean;
  // Step 4
  notifyFollowers: boolean;
  scheduleEnabled: boolean;
  scheduledAt: string;
  communityPost: boolean;
  countdownPage: boolean;
  reminders: boolean;
}

const DEFAULT_DATA: WizardData = {
  title: '', description: '', thumbnailUrl: '', categoryId: '', tags: [],
  moderation: true, aiSummary: false, autoClips: false, recording: false, captions: false,
  visibility: 'public',
  superChat: true, memberships: true, ppv: false, ppvPrice: '', donations: true,
  notifyFollowers: true, scheduleEnabled: false, scheduledAt: '',
  communityPost: false, countdownPage: true, reminders: true,
};

const CATEGORY_PRESETS = [
  'Gaming', 'Education', 'Coding', 'Music', 'Sports',
  'Business', 'Podcast', 'Technology', 'Entertainment', 'Other',
];

interface Props {
  userId: string;
  password: string;
  onPasswordChange: (v: string) => void;
  categories: { id: string; name: string; icon: string }[];
  onCreated: (stream: any, wizardData: WizardData) => void;
  payoutStatus: { stripeConnected: boolean; razorpayConnected: boolean; upiConnected: boolean } | null;
}

const STEPS = [
  { id: 1, label: 'Details' },
  { id: 2, label: 'Settings' },
  { id: 3, label: 'Monetization' },
  { id: 4, label: 'Community' },
  { id: 5, label: 'Review' },
];

export default function StreamCreationWizard({ userId, password, onPasswordChange, categories, onCreated, payoutStatus }: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{ title: string; style: string }[]>([]);
  const thumbInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = <K extends keyof WizardData>(key: K, value: WizardData[K]) =>
    setData(d => ({ ...d, [key]: value }));

  // ── Load draft on mount (localStorage first for instant restore, then
  //     reconcile with the server copy in case of cross-device continuation) ──
  useEffect(() => {
    if (!userId) return;
    try {
      const local = localStorage.getItem(`sv_wizard_draft_${userId}`);
      if (local) {
        const parsed = JSON.parse(local);
        setData(d => ({ ...d, ...parsed.data }));
        setStep(parsed.step || 1);
      }
    } catch {}
    (async () => {
      try {
        const server = await apiGet<{ data: Partial<WizardData>; step: number } | null>(
          `/api/stream-drafts/${encodeURIComponent(userId)}`
        );
        if (server?.data) {
          setData(d => ({ ...d, ...server.data }));
          setStep(server.step || 1);
        }
      } catch {}
      setDraftLoaded(true);
    })();
  }, [userId]);

  // ── Autosave: localStorage immediately, server debounced ──
  useEffect(() => {
    if (!draftLoaded || !userId) return;
    try { localStorage.setItem(`sv_wizard_draft_${userId}`, JSON.stringify({ data, step })); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      apiPut(`/api/stream-drafts/${encodeURIComponent(userId)}`, { data, step }).catch(() => {});
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data, step, draftLoaded, userId]);

  const processThumbnail = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = e => set('thumbnailUrl', e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !data.tags.includes(t) && data.tags.length < 10) {
      set('tags', [...data.tags, t]);
    }
    setTagInput('');
  };

  const generateAITitles = async () => {
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const res = await fetch(`${API}/api/ai/title/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: data.title || data.description || 'live stream',
          keywords: data.tags,
          style: 'engaging',
        }),
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.suggestions)) setAiSuggestions(json.suggestions);
      else if (res.ok && Array.isArray(json)) setAiSuggestions(json);
    } catch {
      setError('Could not generate title suggestions right now.');
    } finally {
      setAiLoading(false);
    }
  };

  const canGoNext = () => {
    if (step === 1) return data.title.trim().length > 0 && (!!data.categoryId || true);
    return true;
  };

  const goNext = () => { if (canGoNext()) setStep(s => Math.min(5, s + 1)); };
  const goBack = () => setStep(s => Math.max(1, s - 1));

  const handleStart = async () => {
    if (!data.title.trim()) { setError('Enter a stream title'); setStep(1); return; }
    setError('');
    setLoading(true);
    try {
      const wizardPrefs = {
        moderation: data.moderation, aiSummary: data.aiSummary, autoClips: data.autoClips,
        recording: data.recording, captions: data.captions,
        superChat: data.superChat, memberships: data.memberships, ppv: data.ppv,
        donations: data.donations,
      };

      const body: Record<string, unknown> = {
        title: data.title.trim(),
        description: data.description.trim() || undefined,
        password: password || undefined,
        userId: userId || undefined,
        categoryId: data.visibility === 'public' ? (data.categoryId || undefined) : undefined,
        isPublic: data.visibility === 'public',
        tags: data.tags.length ? data.tags : undefined,
        thumbnailUrl: data.thumbnailUrl || undefined,
        wizardPrefs,
      };
      if (data.scheduleEnabled && data.scheduledAt) body.scheduledAt = data.scheduledAt;

      const res = await fetch(`${API}/api/streams`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const created = await res.json();
      if (!res.ok) { setError(created.error || 'Failed to create stream'); setLoading(false); return; }

      // ── Fire-and-forget community announcement ──
      if (data.communityPost && userId) {
        apiPost('/api/community/posts', {
          userId,
          type: 'announcement',
          body: data.scheduleEnabled && data.scheduledAt
            ? `📅 Going live soon: "${data.title.trim()}" — see you there!`
            : `🔴 Live now: "${data.title.trim()}"`,
        }).catch(() => {});
      }

      // ── Clear the draft, it's no longer needed ──
      try { localStorage.removeItem(`sv_wizard_draft_${userId}`); } catch {}
      fetch(`${API}/api/stream-drafts/${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch(() => {});

      onCreated(created, data);
    } catch {
      setError('Cannot connect to server. Is it running?');
      setLoading(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* ── Left: Wizard ── */}
      <div className="flex-1 min-w-0 max-w-xl">
        {/* Progress bar */}
        <div className="flex items-center gap-1.5 mb-2">
          {STEPS.map(s => (
            <div key={s.id} className={`h-1 flex-1 rounded-full transition-colors ${s.id <= step ? 'bg-[#ff3520]' : 'bg-white/10'}`} />
          ))}
        </div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Step {step} of 5 · {STEPS[step - 1].label}
          </p>
          <p className="text-xs text-zinc-600">Draft autosaves as you go</p>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl mb-5">{error}</p>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>

            {/* ── STEP 1: DETAILS ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Stream title *</label>
                  <input
                    autoFocus
                    value={data.title}
                    onChange={e => set('title', e.target.value)}
                    placeholder="What are you streaming today?"
                    className="hub-input w-full"
                  />
                  <button
                    onClick={generateAITitles}
                    disabled={aiLoading}
                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#ff3520] hover:text-[#ff5238] disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {aiLoading ? 'Generating...' : 'Suggest titles with AI'}
                  </button>
                  {aiSuggestions.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => { set('title', s.title); setAiSuggestions([]); }}
                          className="block w-full text-left px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-sm text-zinc-300"
                        >
                          {s.title} <span className="text-zinc-600 text-xs">· {s.style}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Description</label>
                  <textarea
                    value={data.description}
                    onChange={e => set('description', e.target.value.slice(0, 500))}
                    placeholder="Tell viewers what to expect..."
                    rows={3}
                    className="hub-input w-full resize-none"
                  />
                  <p className="text-right text-xs text-zinc-600 mt-1">{data.description.length}/500</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Thumbnail</label>
                  <div
                    onClick={() => thumbInput.current?.click()}
                    className="w-full aspect-video rounded-xl border-2 border-dashed border-white/15 hover:border-[#ff3520]/40 flex items-center justify-center cursor-pointer overflow-hidden bg-white/[0.03] transition-colors"
                  >
                    {data.thumbnailUrl
                      ? <img src={data.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="flex flex-col items-center gap-1.5 text-zinc-500">
                          <Upload className="w-5 h-5" /><span className="text-xs">Click to upload</span>
                        </div>}
                  </div>
                  <input ref={thumbInput} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) processThumbnail(f); }} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {(categories.length ? categories : CATEGORY_PRESETS.map(name => ({ id: name, name, icon: '' }))).map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => set('categoryId', c.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          data.categoryId === c.id
                            ? 'bg-[#ff3520] border-[#ff3520] text-white'
                            : 'border-white/[0.10] text-zinc-400 hover:border-white/20'
                        }`}
                      >
                        {c.icon ? `${c.icon} ` : ''}{c.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Tags (optional)</label>
                  <div className="flex gap-2">
                    <input
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                      placeholder="Add a tag and press Enter"
                      className="hub-input flex-1"
                    />
                    <button onClick={addTag} className="px-4 py-2.5 rounded-xl border border-white/[0.10] text-sm text-zinc-300 hover:bg-white/[0.04]">Add</button>
                  </div>
                  {data.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {data.tags.map(t => (
                        <span key={t} className="flex items-center gap-1 text-xs bg-white/[0.06] text-zinc-300 px-2.5 py-1 rounded-full">
                          #{t}
                          <button onClick={() => set('tags', data.tags.filter(x => x !== t))}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: STREAM SETTINGS ── */}
            {step === 2 && (
              <div className="space-y-5">
                <ToggleRow icon={Shield} label="Enable Moderation" sub="AI auto-moderation tools available in chat" checked={data.moderation} onChange={v => set('moderation', v)} />
                <ToggleRow icon={Sparkles} label="AI Summary Generator" sub="Generate a recap after the stream ends (you trigger it from Studio)" checked={data.aiSummary} onChange={v => set('aiSummary', v)} />
                <ToggleRow icon={Scissors} label="Automatic Clips" sub="Auto-suggest highlight clips when the stream ends" checked={data.autoClips} onChange={v => set('autoClips', v)} />
                <ToggleRow icon={Video} label="Replay Recording" sub="Starts automatically once your camera/mic is live" checked={data.recording} onChange={v => set('recording', v)} />
                <ToggleRow icon={Captions} label="Live Captions" sub="Starts automatically once your camera/mic is live" checked={data.captions} onChange={v => set('captions', v)} />

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Visibility</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'public', label: 'Public', icon: Globe },
                      { id: 'private', label: 'Private', icon: Lock },
                      { id: 'unlisted', label: 'Unlisted', icon: EyeOff },
                    ].map(v => (
                      <button
                        key={v.id}
                        onClick={() => set('visibility', v.id as WizardData['visibility'])}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-colors ${
                          data.visibility === v.id ? 'bg-[#ff3520]/15 border-[#ff3520]/40 text-white' : 'border-white/[0.08] text-zinc-400 hover:border-white/20'
                        }`}
                      >
                        <v.icon className="w-4 h-4" /> {v.label}
                      </button>
                    ))}
                  </div>
                  {data.visibility === 'private' && (
                    <input
                      value={password}
                      onChange={e => onPasswordChange(e.target.value)}
                      placeholder="Set a password for this stream"
                      className="hub-input w-full mt-3"
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 3: MONETIZATION ── */}
            {step === 3 && (
              <div className="space-y-5">
                <ToggleRow icon={MessageSquare} label="Enable Super Chat" sub="Paid highlighted messages during the stream" checked={data.superChat} onChange={v => set('superChat', v)} />
                <ToggleRow icon={Crown} label="Enable Membership Perks" sub="Your existing membership tiers stay active" checked={data.memberships} onChange={v => set('memberships', v)} />
                <ToggleRow icon={Ticket} label="Enable Pay-Per-View" sub="Charge viewers to watch this stream" checked={data.ppv} onChange={v => set('ppv', v)} />
                {data.ppv && (
                  <input
                    value={data.ppvPrice}
                    onChange={e => set('ppvPrice', e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Price (in your currency's smallest unit, e.g. paise)"
                    className="hub-input w-full -mt-2"
                  />
                )}
                <ToggleRow icon={Heart} label="Enable Donations" sub="Viewers can send one-time support" checked={data.donations} onChange={v => set('donations', v)} />

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">Payout destination</p>
                  {payoutStatus ? (
                    <div className="space-y-2">
                      <PayoutLine icon={CreditCard} label="Stripe" connected={payoutStatus.stripeConnected} />
                      <PayoutLine icon={Wallet} label="Razorpay" connected={payoutStatus.razorpayConnected} />
                      <PayoutLine icon={IndianRupee} label="UPI" connected={payoutStatus.upiConnected} />
                      {!payoutStatus.stripeConnected && !payoutStatus.razorpayConnected && !payoutStatus.upiConnected && (
                        <p className="text-xs text-amber-400 mt-2">
                          No payout destination connected yet. Set one up in{' '}
                          <a href="/studio?tab=payouts" className="underline">Settings → Payouts</a> before going live with monetization enabled.
                        </p>
                      )}
                      <p className="text-xs text-zinc-600 pt-1">
                        Manage in <a href="/studio?tab=payouts" className="underline hover:text-zinc-400">Settings → Payouts</a> — never asked here.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Loading payout status...</p>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 4: COMMUNITY & NOTIFICATIONS ── */}
            {step === 4 && (
              <div className="space-y-5">
                <ToggleRow icon={Bell} label="Notify Followers" sub="Followers with notifications on get an alert the moment you go live" checked={data.notifyFollowers} onChange={v => set('notifyFollowers', v)} />

                <ToggleRow icon={Calendar} label="Schedule for later" sub="Pick a future date/time instead of going live now" checked={data.scheduleEnabled} onChange={v => set('scheduleEnabled', v)} />
                {data.scheduleEnabled && (
                  <input
                    type="datetime-local"
                    value={data.scheduledAt}
                    onChange={e => set('scheduledAt', e.target.value)}
                    className="hub-input w-full -mt-2"
                  />
                )}
                {data.scheduleEnabled && (
                  <p className="text-xs text-zinc-600 -mt-2 pl-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> A live countdown and email reminders are included automatically for scheduled streams.
                  </p>
                )}

                <ToggleRow icon={Megaphone} label="Post Community Announcement" sub="Auto-post to your Community feed when this stream is created" checked={data.communityPost} onChange={v => set('communityPost', v)} />
              </div>
            )}

            {/* ── STEP 5: REVIEW ── */}
            {step === 5 && (
              <div className="space-y-4">
                <ReviewSection title="Stream details" onEdit={() => setStep(1)}>
                  <ReviewLine label="Title" value={data.title || '—'} />
                  <ReviewLine label="Description" value={data.description || '—'} />
                  <ReviewLine label="Category" value={(categories.find(c => c.id === data.categoryId)?.name) || data.categoryId || '—'} />
                  <ReviewLine label="Tags" value={data.tags.length ? data.tags.map(t => `#${t}`).join(' ') : '—'} />
                </ReviewSection>

                <ReviewSection title="Settings" onEdit={() => setStep(2)}>
                  <ReviewLine label="Moderation" value={data.moderation ? 'Enabled' : 'Off'} />
                  <ReviewLine label="AI Summary" value={data.aiSummary ? 'Enabled (manual trigger)' : 'Off'} />
                  <ReviewLine label="Auto Clips" value={data.autoClips ? 'Enabled' : 'Off'} />
                  <ReviewLine label="Recording" value={data.recording ? 'Auto-starts with camera' : 'Off'} />
                  <ReviewLine label="Captions" value={data.captions ? 'Auto-starts with camera' : 'Off'} />
                  <ReviewLine label="Visibility" value={data.visibility} />
                </ReviewSection>

                <ReviewSection title="Monetization" onEdit={() => setStep(3)}>
                  <ReviewLine label="Super Chat" value={data.superChat ? 'Enabled' : 'Off'} />
                  <ReviewLine label="Memberships" value={data.memberships ? 'Enabled' : 'Off'} />
                  <ReviewLine label="PPV" value={data.ppv ? `Enabled (${data.ppvPrice || '—'})` : 'Off'} />
                  <ReviewLine label="Donations" value={data.donations ? 'Enabled' : 'Off'} />
                </ReviewSection>

                <ReviewSection title="Community & notifications" onEdit={() => setStep(4)}>
                  <ReviewLine label="Notify followers" value={data.notifyFollowers ? 'Yes' : 'No'} />
                  <ReviewLine label="Schedule" value={data.scheduleEnabled && data.scheduledAt ? new Date(data.scheduledAt).toLocaleString() : 'Going live now'} />
                  <ReviewLine label="Community post" value={data.communityPost ? 'Will post on creation' : 'Off'} />
                </ReviewSection>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="flex items-center gap-3 mt-8">
          {step > 1 && (
            <button onClick={goBack} disabled={loading} className="px-4 py-3 rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 text-sm font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <div className="flex-1" />
          {step < 5 && (
            <button
              onClick={goNext}
              disabled={!canGoNext()}
              className="px-6 py-3 rounded-xl bg-[#ff3520] text-white text-sm font-bold hover:bg-[#e02e1a] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              Continue <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {step === 5 && (
            <button
              onClick={handleStart}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-[#ff3520] text-white text-sm font-bold hover:bg-[#e02e1a] disabled:opacity-60 flex items-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              {loading
                ? (data.scheduleEnabled ? 'Scheduling...' : 'Starting...')
                : (data.scheduleEnabled && data.scheduledAt ? 'Schedule Stream' : 'Start Stream')}
            </button>
          )}
        </div>
      </div>

      {/* ── Right: Live preview card ── */}
      <div className="w-full lg:w-80 flex-shrink-0">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">Preview</p>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden sticky top-6">
          <div className="aspect-video bg-zinc-900 relative">
            {data.thumbnailUrl
              ? <img src={data.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              : <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs">No thumbnail yet</div>}
            <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            {data.visibility !== 'public' && (
              <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                {data.visibility === 'private' ? <Lock className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                {data.visibility}
              </span>
            )}
          </div>
          <div className="p-3.5">
            <p className="text-sm font-semibold text-white truncate">{data.title || 'Your stream title'}</p>
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{data.description || 'Your stream description will appear here.'}</p>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {data.categoryId && (
                <span className="text-[11px] bg-white/[0.06] text-zinc-400 px-2 py-0.5 rounded-full">
                  {categories.find(c => c.id === data.categoryId)?.name || data.categoryId}
                </span>
              )}
              {data.ppv && <span className="text-[11px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">PPV</span>}
              {data.donations && <span className="text-[11px] bg-pink-500/15 text-pink-400 px-2 py-0.5 rounded-full">Donations</span>}
              {data.captions && <span className="text-[11px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full">CC</span>}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .hub-input {
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.75rem;
          color: white;
        }
        .hub-input::placeholder { color: rgba(161,161,170,0.6); }
        .hub-input:focus { outline: none; border-color: rgba(255,53,32,0.5); }
      `}</style>
    </div>
  );
}

// ── Small subcomponents ─────────────────────────────────────────────────────

function ToggleRow({ icon: Icon, label, sub, checked, onChange }: {
  icon: any; label: string; sub: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#ff3520]/15 text-[#ff3520]' : 'bg-white/[0.05] text-zinc-500'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
      </div>
      <div className={`w-10 h-6 rounded-full flex-shrink-0 flex items-center px-0.5 transition-colors ${checked ? 'bg-[#ff3520] justify-end' : 'bg-white/10 justify-start'}`}>
        <div className="w-5 h-5 rounded-full bg-white" />
      </div>
    </button>
  );
}

function PayoutLine({ icon: Icon, label, connected }: { icon: any; label: string; connected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={`w-4 h-4 ${connected ? 'text-green-400' : 'text-zinc-600'}`} />
      <span className={connected ? 'text-zinc-300' : 'text-zinc-600'}>{label}</span>
      {connected && <Check className="w-3.5 h-3.5 text-green-400 ml-auto" />}
    </div>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">{title}</p>
        <button onClick={onEdit} className="text-xs font-semibold text-[#ff3520] hover:text-[#ff5238]">Edit</button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-zinc-500 flex-shrink-0">{label}</span>
      <span className="text-zinc-300 text-right truncate">{value}</span>
    </div>
  );
}
