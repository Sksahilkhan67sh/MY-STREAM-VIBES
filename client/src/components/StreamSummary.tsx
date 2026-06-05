/**
 * client/src/components/StreamSummary.tsx
 * PHASE 7 — AI Stream Summary Component
 *
 * Shown on the dashboard after a stream ends.
 * Triggered from dashboard/[roomId]/page.tsx or a "Stream ended" state in HostControls.
 */

'use client';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Download, ChevronDown, ChevronUp,
  CheckSquare, BookOpen, Lightbulb, MessageSquare,
  Clock, Loader2, FileText, RefreshCw,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Chapter {
  title: string;
  startMs: number;
  endMs: number;
  summary: string;
}

interface Summary {
  id: string;
  title: string;
  summary: string;
  keyTakeaways: string[];
  chapters: Chapter[];
  actionItems: string[];
  discussionPoints: string[];
  generatedAt: string;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ── Collapsible Section ───────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  count,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
          <Icon className="w-4 h-4 text-gray-500" />
          {title}
          {count !== undefined && (
            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              {count}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StreamSummary({
  roomId,
  hostToken,
}: {
  roomId: string;
  hostToken: string;
}) {
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Try existing first
      const existing = await fetch(`${API}/api/summary/${roomId}`);
      if (existing.ok) {
        const d = await existing.json();
        setSummary(d.summary);
        setGenerated(true);
        return;
      }
      // Generate new
      const res = await fetch(`${API}/api/summary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSummary(data.summary);
      setGenerated(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [roomId, hostToken]);

  const downloadMarkdown = () => {
    window.open(`${API}/api/summary/${roomId}/download?format=md`, '_blank');
  };

  if (!generated) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">AI Stream Summary</h3>
          <p className="text-sm text-gray-500 mt-1">Generate a summary, key takeaways, chapters, and action items from your stream.</p>
        </div>
        {error && (
          <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2 w-full">{error}</p>
        )}
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition disabled:opacity-50"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Summary</>
          )}
        </button>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Summary</h3>
            <p className="text-xs text-gray-500">{new Date(summary.generatedAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generate}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            title="Regenerate"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={downloadMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            <Download className="w-3.5 h-3.5" /> Markdown
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-3">
        {/* Summary paragraph */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{summary.summary}</p>
        </div>

        {/* Key takeaways */}
        <Section icon={Lightbulb} title="Key Takeaways" count={summary.keyTakeaways.length} defaultOpen>
          <ul className="space-y-2">
            {summary.keyTakeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ul>
        </Section>

        {/* Chapters */}
        {summary.chapters.length > 0 && (
          <Section icon={Clock} title="Chapters" count={summary.chapters.length} defaultOpen={false}>
            <div className="space-y-3">
              {summary.chapters.map((ch, i) => (
                <div key={i} className="flex gap-3">
                  <div className="text-xs font-mono text-gray-400 mt-0.5 flex-shrink-0 pt-1">
                    {formatMs(ch.startMs)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ch.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{ch.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Action items */}
        {summary.actionItems.length > 0 && (
          <Section icon={CheckSquare} title="Action Items" count={summary.actionItems.length} defaultOpen={false}>
            <ul className="space-y-2">
              {summary.actionItems.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <CheckSquare className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  {a}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Discussion points */}
        {summary.discussionPoints.length > 0 && (
          <Section icon={MessageSquare} title="Discussion Points" count={summary.discussionPoints.length} defaultOpen={false}>
            <ul className="space-y-1.5">
              {summary.discussionPoints.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0 mt-2" />
                  {d}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </motion.div>
  );
}
