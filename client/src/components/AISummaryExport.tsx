'use client';
/**
 * client/src/components/AISummaryExport.tsx
 * Feature 9: AI Stream Summary Export
 *
 * Generates a full AI summary of the stream including:
 * - Overview, key takeaways, chapters, action items
 * - Export as Markdown, JSON, or plain text
 * - Title suggestions from the summary
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Download, Sparkles, ChevronDown, ChevronUp,
  X, Check, Clock, Lightbulb, List, Target, MessageSquare,
  RefreshCw, Copy,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SummaryData {
  id: string;
  title: string;
  summary: string;
  keyTakeaways: string[];
  chapters: { title: string; startMs: number; endMs: number; summary: string }[];
  actionItems: string[];
  discussionPoints: string[];
  titleSuggestions: { title: string; style: string; hook: string }[];
  createdAt: string;
  updatedAt: string;
}

interface AISummaryExportProps {
  roomId: string;
  hostToken: string;
  streamTitle: string;
  onClose?: () => void;
  onTitleApplied?: (title: string) => void;
}

type ExportFormat = 'md' | 'json' | 'txt';

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  return `${m}:${String(s % 60).padStart(2,'0')}`;
}

function Section({ icon, title, children, defaultOpen = true }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          {icon}{title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/10">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AISummaryExport({
  roomId, hostToken, streamTitle, onClose, onTitleApplied,
}: AISummaryExportProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [applyingTitle, setApplyingTitle] = useState<string | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    try {
      // Try to load existing summary from the summary endpoint
      const res = await fetch(`${API}/api/summary/${roomId}`, {
        headers: { 'x-host-token': hostToken },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summary?.summary) {
          setSummary({
            ...data.summary,
            keyTakeaways: safeJSON(data.summary.keyTakeaways, []),
            chapters: safeJSON(data.summary.chapters, []),
            actionItems: safeJSON(data.summary.actionItems, []),
            discussionPoints: safeJSON(data.summary.discussionPoints, []),
            titleSuggestions: safeJSON(data.summary.titleSuggestions, []),
          });
        }
      }
    } catch { }
  }, [roomId, hostToken]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/ai/summary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const s = data.summary;
      setSummary({
        ...s,
        keyTakeaways: Array.isArray(s.keyTakeaways) ? s.keyTakeaways : safeJSON(s.keyTakeaways, []),
        chapters: Array.isArray(s.chapters) ? s.chapters : safeJSON(s.chapters, []),
        actionItems: Array.isArray(s.actionItems) ? s.actionItems : safeJSON(s.actionItems, []),
        discussionPoints: Array.isArray(s.discussionPoints) ? s.discussionPoints : safeJSON(s.discussionPoints, []),
        titleSuggestions: Array.isArray(s.titleSuggestions) ? s.titleSuggestions : safeJSON(s.titleSuggestions, []),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to generate summary. Ensure ANTHROPIC_API_KEY is set.');
    } finally {
      setGenerating(false);
    }
  };

  const download = async (format: ExportFormat) => {
    setDownloading(format);
    try {
      const res = await fetch(`${API}/api/ai/summary/${roomId}/download?format=${format}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (streamTitle || 'summary').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeTitle}-summary.${format === 'json' ? 'json' : 'md'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download. Generate summary first.');
    } finally {
      setDownloading(null);
    }
  };

  const copyMarkdown = async () => {
    if (!summary) return;
    const md = buildMarkdown(summary);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyTitle = async (title: string) => {
    setApplyingTitle(title);
    try {
      const res = await fetch(`${API}/api/ai/title/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, title }),
      });
      if (!res.ok) throw new Error('Failed');
      setAppliedTitle(title);
      onTitleApplied?.(title);
      setTimeout(() => setAppliedTitle(null), 3000);
    } catch {
      setError('Failed to apply title');
    } finally {
      setApplyingTitle(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#ff3520]" />
          <span className="text-white font-semibold text-sm">AI Summary & Export</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Generate button + error */}
        <div className="p-4 border-b border-white/10 flex flex-col gap-3">
          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#ff3520] to-[#ff6b20] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Analyzing stream with AI…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {summary ? 'Regenerate Summary' : 'Generate AI Summary'}
              </>
            )}
          </button>

          {summary && (
            <div className="flex gap-2">
              {(['md', 'json'] as ExportFormat[]).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => download(fmt)}
                  disabled={!!downloading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-semibold hover:bg-white/10 disabled:opacity-40 transition-colors"
                >
                  {downloading === fmt
                    ? <div className="w-3.5 h-3.5 border border-current/40 border-t-current rounded-full animate-spin" />
                    : <Download className="w-3.5 h-3.5" />}
                  Export .{fmt}
                </button>
              ))}
              <button
                onClick={copyMarkdown}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-xs font-semibold hover:bg-white/10 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* Summary content */}
        {generating ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#ff3520] rounded-full animate-spin" />
            <p className="text-zinc-500 text-sm">Claude is analyzing your stream…</p>
            <p className="text-zinc-700 text-xs text-center px-8">This may take 10-30 seconds depending on stream length</p>
          </div>
        ) : summary ? (
          <div className="p-4 flex flex-col gap-3">
            {/* Overview */}
            <Section icon={<FileText className="w-4 h-4 text-[#ff3520]" />} title="Overview">
              <p className="text-zinc-300 text-sm leading-relaxed mt-3">{summary.summary}</p>
              <p className="text-zinc-600 text-xs mt-2">
                Generated {summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : ''}
              </p>
            </Section>

            {/* Key Takeaways */}
            {summary.keyTakeaways.length > 0 && (
              <Section icon={<Lightbulb className="w-4 h-4 text-yellow-400" />} title="Key Takeaways">
                <ul className="flex flex-col gap-2 mt-3">
                  {summary.keyTakeaways.map((t, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-zinc-300 text-sm leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Chapters */}
            {summary.chapters.length > 0 && (
              <Section icon={<Clock className="w-4 h-4 text-blue-400" />} title="Chapters">
                <div className="flex flex-col gap-2.5 mt-3">
                  {summary.chapters.map((c, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-zinc-600 text-xs font-mono mt-0.5 w-10 flex-shrink-0">
                        {formatMs(c.startMs)}
                      </span>
                      <div>
                        <p className="text-white text-sm font-semibold">{c.title}</p>
                        <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">{c.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Action Items */}
            {summary.actionItems.length > 0 && (
              <Section icon={<Target className="w-4 h-4 text-green-400" />} title="Action Items">
                <ul className="flex flex-col gap-1.5 mt-3">
                  {summary.actionItems.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded border border-green-500/40 flex-shrink-0 mt-0.5" />
                      <span className="text-zinc-300 text-sm leading-relaxed">{a}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Discussion Points */}
            {summary.discussionPoints.length > 0 && (
              <Section icon={<MessageSquare className="w-4 h-4 text-purple-400" />} title="Discussion Points" defaultOpen={false}>
                <ul className="flex flex-col gap-1.5 mt-3">
                  {summary.discussionPoints.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-purple-400 text-xs mt-0.5">•</span>
                      <span className="text-zinc-300 text-sm leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Title Suggestions from summary */}
            {summary.titleSuggestions.length > 0 && (
              <Section icon={<Sparkles className="w-4 h-4 text-[#ff3520]" />} title="Suggested Titles" defaultOpen={false}>
                <div className="flex flex-col gap-2 mt-3">
                  {summary.titleSuggestions.map((s, i) => (
                    <div key={i} className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all
                      ${appliedTitle === s.title ? 'border-green-500/40 bg-green-500/10' : 'border-white/10 bg-white/3'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{s.title}</p>
                        {s.hook && <p className="text-zinc-500 text-xs mt-0.5 italic truncate">{s.hook}</p>}
                      </div>
                      <button
                        onClick={() => applyTitle(s.title)}
                        disabled={!!applyingTitle || appliedTitle === s.title}
                        className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${appliedTitle === s.title
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-[#ff3520]/10 border border-[#ff3520]/30 text-[#ff3520] hover:bg-[#ff3520]/20 disabled:opacity-40'}`}
                      >
                        {applyingTitle === s.title
                          ? <div className="w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                          : <Check className="w-3 h-3" />}
                        {appliedTitle === s.title ? 'Applied' : 'Use'}
                      </button>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#ff3520]/10 border border-[#ff3520]/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-[#ff3520]" />
            </div>
            <div>
              <p className="text-white font-semibold">AI-Powered Summary</p>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">
                Generate a complete summary with key takeaways, chapters, action items, and title suggestions.
                Works best after the stream ends.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function safeJSON(val: any, fallback: any): any {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}

function buildMarkdown(s: SummaryData): string {
  const lines = [
    `# ${s.title}`,
    `> Generated: ${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ''}`,
    '',
    '## Summary',
    s.summary,
    '',
  ];
  if (s.keyTakeaways.length) {
    lines.push('## Key Takeaways', ...s.keyTakeaways.map((k, i) => `${i + 1}. ${k}`), '');
  }
  if (s.chapters.length) {
    lines.push('## Chapters', ...s.chapters.map(c => `### ${c.title}\n${c.summary}`), '');
  }
  if (s.actionItems.length) {
    lines.push('## Action Items', ...s.actionItems.map(a => `- [ ] ${a}`), '');
  }
  if (s.discussionPoints.length) {
    lines.push('## Discussion Points', ...s.discussionPoints.map(d => `- ${d}`), '');
  }
  return lines.join('\n');
}
