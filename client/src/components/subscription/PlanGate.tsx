'use client';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Lock, Zap } from 'lucide-react';
import type { PlanFeatures } from '@/hooks/useSubscription';

interface PlanGateProps {
  /** Feature to check */
  feature:      keyof PlanFeatures;
  /** From useSubscription */
  can:          (f: keyof PlanFeatures) => boolean;
  /** Plan name user needs, e.g. "Basic" */
  requiredPlan?: string;
  /** Rendered when allowed */
  children:     React.ReactNode;
  /** Optional: render a locked version instead of hiding */
  lockedFallback?: React.ReactNode;
}

/**
 * Wraps any component and shows a paywall CTA if the user's plan
 * doesn't include the given feature.
 *
 * Usage:
 *   <PlanGate feature="canRecord" can={can} requiredPlan="Basic">
 *     <RecordingPanel />
 *   </PlanGate>
 */
export default function PlanGate({
  feature, can, requiredPlan, children, lockedFallback,
}: PlanGateProps) {
  const router  = useRouter();
  const allowed = can(feature);

  if (allowed) return <>{children}</>;

  if (lockedFallback) return <>{lockedFallback}</>;

  const featureLabel = feature
    .replace(/^can|^has/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl p-6 flex flex-col items-center text-center gap-4"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border:     '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(255,53,32,0.12)', border: '1px solid rgba(255,53,32,0.2)' }}
      >
        <Lock className="w-5 h-5 text-[#ff3520]" />
      </div>

      <div>
        <p className="text-sm font-bold text-zinc-200">
          {featureLabel} requires {requiredPlan ?? 'a higher'} plan
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Upgrade to unlock this feature and many more.
        </p>
      </div>

      <button
        onClick={() => router.push('/pricing')}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all"
        style={{ background: 'linear-gradient(135deg, #ff3520, #c81405)' }}
      >
        <Zap className="w-3.5 h-3.5" />
        Upgrade now
      </button>
    </motion.div>
  );
}
