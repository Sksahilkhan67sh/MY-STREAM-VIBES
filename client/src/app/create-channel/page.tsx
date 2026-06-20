'use client';
export const dynamic = 'force-dynamic';

// client/src/app/create-channel/page.tsx
//
// Required step between "I'm a Creator" and the Studio. Collects the
// channel handle (username), avatar, banner, and bio, then writes them
// via the EXISTING PATCH /api/creators/profile endpoint — no new models,
// no new tables. Username uniqueness is checked live against the new
// GET /api/users/check-username/:username endpoint.
//
// Reached from:
//   /onboarding      → choose "Creator" → here
//   /become-creator  → upgrade to Creator → here
// Also reachable any time later from Studio if a CREATOR has no channel
// yet (see studio guard), so creators are never stuck.

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Upload, Check, X, ArrowRight, ArrowLeft, Loader2,
  ImageIcon, User, AlignLeft, PartyPopper,
} from 'lucide-react';
import { apiGet, apiPatch } from '@/lib/api';
import { useUserRole } from '@/hooks/useUserRole';

type Step = 1 | 2 | 3 | 4;

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function slugify(input: string) {
  return input.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
}

export default function CreateChannelPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';
  const { role, hasSelectedRole, hasChannel, loading: roleLoading, refetch: refetchRole } = useUserRole();

  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Step 1 — channel name
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<AvailabilityState>('idle');
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 — avatar (required)
  const [avatarUrl, setAvatarUrl] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);

  // Step 3 — banner (optional)
  const [bannerUrl, setBannerUrl] = useState('');
  const bannerInput = useRef<HTMLInputElement>(null);

  // Step 4 — bio (optional)
  const [bio, setBio] = useState('');

  // ── Guards ──
  // Not logged in → login. Never selected a role / chose Viewer → send to
  // the right place instead of leaving them stuck on a Creator-only wizard.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated' || roleLoading) return;
    if (!hasSelectedRole) { router.replace('/onboarding'); return; }
    if (role === 'VIEWER') { router.replace('/become-creator'); return; }
    // Already has a channel — nothing to do here, go straight to Studio.
    if (hasChannel && !done) { router.replace('/studio'); return; }
  }, [status, roleLoading, hasSelectedRole, role, hasChannel, done, router]);

  // ── Live username availability check (debounced) ──
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const value = username.trim();
    if (!value) { setAvailability('idle'); return; }
    if (value.length < 3 || value.length > 30) { setAvailability('invalid'); return; }
    setAvailability('checking');
    checkTimer.current = setTimeout(async () => {
      try {
        const data = await apiGet<{ available: boolean; reason: string | null }>(
          `/api/users/check-username/${encodeURIComponent(value)}?userId=${encodeURIComponent(userId)}`
        );
        setAvailability(data.available ? 'available' : (data.reason === 'invalid' ? 'invalid' : 'taken'));
      } catch {
        setAvailability('idle');
      }
    }, 400);
    return () => { if (checkTimer.current) clearTimeout(checkTimer.current); };
  }, [username, userId]);

  const processImage = useCallback((file: File, onLoaded: (dataUrl: string) => void, setErr: (m: string) => void) => {
    if (!file.type.startsWith('image/')) { setErr('Please upload an image file (JPG, PNG, WebP)'); return; }
    if (file.size > 5 * 1024 * 1024) { setErr('Image must be under 5MB'); return; }
    setErr('');
    const reader = new FileReader();
    reader.onload = e => onLoaded(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const canContinueStep1 = username.trim().length >= 3 && availability === 'available';
  const canContinueStep2 = !!avatarUrl;

  const goNext = () => setStep(s => (Math.min(4, s + 1) as Step));
  const goBack = () => setStep(s => (Math.max(1, s - 1) as Step));

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      await apiPatch('/api/creators/profile', {
        userId,
        username: username.trim(),
        avatarUrl,
        ...(bannerUrl && { bannerUrl }),
        ...(bio.trim() && { bio: bio.trim() }),
      });
      setDone(true);
      await refetchRole();
      setTimeout(() => router.replace('/studio'), 1200);
    } catch (e: any) {
      setError(e?.message || 'Could not create your channel. Please try again.');
      setSaving(false);
    }
  };

  if (status === 'loading' || status === 'unauthenticated' || roleLoading) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4" style={{ fontFamily: "'DM Sans','Inter',sans-serif" }}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/25 flex items-center justify-center mx-auto mb-5">
            <PartyPopper className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Channel created!</h1>
          <p className="text-sm text-zinc-500">Taking you to your Studio…</p>
        </motion.div>
      </div>
    );
  }

  const stepMeta: Record<Step, { title: string; subtitle: string; icon: typeof User }> = {
    1: { title: 'Name your channel', subtitle: 'This is your unique handle on Stream Vault.', icon: User },
    2: { title: 'Add a profile picture', subtitle: 'Help viewers recognize you at a glance.', icon: ImageIcon },
    3: { title: 'Add a banner', subtitle: 'Optional — shown at the top of your channel page.', icon: ImageIcon },
    4: { title: 'Tell viewers about yourself', subtitle: 'Optional — you can always change this later.', icon: AlignLeft },
  };

  return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4 py-12" style={{ fontFamily: "'DM Sans','Inter',sans-serif" }}>
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= step ? 'bg-[#ff3520]' : 'bg-white/10'}`} />
          ))}
        </div>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-[#ff3520]/15 border border-[#ff3520]/25 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-[#ff3520]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Step {step} of 4</p>
            <h1 className="text-xl font-bold text-white tracking-tight">{stepMeta[step].title}</h1>
          </div>
        </div>
        <p className="text-sm text-zinc-500 -mt-4 mb-6">{stepMeta[step].subtitle}</p>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl mb-6">{error}</p>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
                <input
                  autoFocus
                  value={username}
                  onChange={e => setUsername(slugify(e.target.value))}
                  placeholder="CodeWithSahil"
                  className="w-full pl-8 pr-10 py-3.5 bg-white/[0.04] border border-white/[0.08] focus:border-[#ff3520]/50 rounded-xl text-white text-sm placeholder:text-zinc-600 outline-none transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2">
                  {availability === 'checking' && <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />}
                  {availability === 'available' && <Check className="w-4 h-4 text-green-400" />}
                  {(availability === 'taken' || availability === 'invalid') && <X className="w-4 h-4 text-red-400" />}
                </span>
              </div>
              <p className={`text-xs mt-2 ${
                availability === 'available' ? 'text-green-400'
                  : availability === 'taken' ? 'text-red-400'
                  : availability === 'invalid' ? 'text-red-400'
                  : 'text-zinc-600'
              }`}>
                {availability === 'available' && 'This handle is available.'}
                {availability === 'taken' && 'That handle is already taken.'}
                {availability === 'invalid' && 'Use 3–30 letters, numbers, or underscores.'}
                {availability === 'idle' && 'Letters, numbers, and underscores only. Examples: SahilGaming, SahilLive.'}
                {availability === 'checking' && 'Checking availability…'}
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <div
                onClick={() => avatarInput.current?.click()}
                className="mx-auto w-32 h-32 rounded-full border-2 border-dashed border-white/20 hover:border-[#ff3520]/50 flex items-center justify-center cursor-pointer overflow-hidden bg-white/[0.04] transition-colors"
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt="Avatar preview" className="w-full h-full object-cover" />
                  : <Upload className="w-7 h-7 text-zinc-500" />}
              </div>
              <input ref={avatarInput} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processImage(f, setAvatarUrl, setError); }} />
              <p className="text-center text-xs text-zinc-600 mt-4">PNG, JPG, WebP · Max 5MB · Square recommended</p>
              {avatarUrl && (
                <button onClick={() => setAvatarUrl('')} className="block mx-auto mt-3 text-xs text-zinc-500 hover:text-zinc-300">
                  Remove and choose another
                </button>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <div
                onClick={() => bannerInput.current?.click()}
                className="w-full aspect-[3/1] rounded-xl border-2 border-dashed border-white/20 hover:border-[#ff3520]/50 flex items-center justify-center cursor-pointer overflow-hidden bg-white/[0.04] transition-colors"
              >
                {bannerUrl
                  ? <img src={bannerUrl} alt="Banner preview" className="w-full h-full object-cover" />
                  : <div className="flex flex-col items-center gap-1.5">
                      <Upload className="w-6 h-6 text-zinc-500" />
                      <span className="text-xs text-zinc-500">Click to upload a banner</span>
                    </div>}
              </div>
              <input ref={bannerInput} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processImage(f, setBannerUrl, setError); }} />
              {bannerUrl && (
                <button onClick={() => setBannerUrl('')} className="block mx-auto mt-3 text-xs text-zinc-500 hover:text-zinc-300">
                  Remove banner
                </button>
              )}
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 280))}
                placeholder="Tell viewers what your channel is about…"
                rows={4}
                className="w-full px-4 py-3.5 bg-white/[0.04] border border-white/[0.08] focus:border-[#ff3520]/50 rounded-xl text-white text-sm placeholder:text-zinc-600 outline-none transition-colors resize-none"
              />
              <p className="text-right text-xs text-zinc-600 mt-1.5">{bio.length}/280</p>

              {/* Summary card */}
              <div className="mt-5 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                  {avatarUrl && <img src={avatarUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="overflow-hidden">
                  <p className="text-white font-semibold text-sm truncate">@{username || 'yourhandle'}</p>
                  <p className="text-zinc-500 text-xs truncate">{bio || 'No bio yet'}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav buttons */}
        <div className="flex items-center gap-3 mt-8">
          {step > 1 && (
            <button onClick={goBack} disabled={saving} className="px-4 py-3 rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 text-sm font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <div className="flex-1" />
          {step < 4 && (
            <button
              onClick={goNext}
              disabled={(step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2)}
              className="px-6 py-3 rounded-xl bg-[#ff3520] text-white text-sm font-bold hover:bg-[#e02e1a] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              Continue <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {step === 4 && (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-[#ff3520] text-white text-sm font-bold hover:bg-[#e02e1a] disabled:opacity-60 flex items-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              {saving ? 'Creating your channel…' : 'Create Channel'}
            </button>
          )}
        </div>

        {step < 4 && (step === 3) && (
          <button onClick={goNext} className="block mx-auto mt-4 text-xs text-zinc-600 hover:text-zinc-400">
            Skip this step
          </button>
        )}
      </div>
    </div>
  );
}
