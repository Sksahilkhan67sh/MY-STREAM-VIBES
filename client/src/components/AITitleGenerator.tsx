'use client';
/**
 * client/src/components/AITitleGenerator.tsx
 * Feature 8: AI Title Generation
 *
 * Generates 5 title suggestions using Claude AI.
 * Host can pick one and apply it live to the stream.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, RefreshCw, Wand2, X, ChevronDown, ChevronUp } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface TitleSuggestion {
  title: string;
  style: string;
  hook: string;
}

interface AITitleGeneratorProps {
  roomId: string;
  hostToken: string;
  currentTitle: string;
  onTitleApplied?: (title: string) => void;
  onClose?: () => void;
}

const STYLES = ['engaging', 'clickbait', 'professional', 'question', 'listicle'];
const STYLE_COLORS: Record<string, string> = {
  engaging: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  clickbait: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  professional: 'text-green-400 bg-green-500/10 border-green-500/20',
  question: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  listicle: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

export default function AITitleGenerator({
  roomId, hostToken, currentTitle, onTitleApplied, onClose,
}: AITitleGeneratorProps) {
  const [topic, setTopic] = useState(currentTitle);
  const [keywords, setKeywords] = useState('');
  const [style, setStyle] = useState('engaging');
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const generate = async () => {
    if (!topic.trim()) { setError('Enter a topic to generate titles'); return; }
    setLoading(true);
    setError('');
    setSuggestions([]);
    try {
      const res = await fetch(`${API}/api/ai/title/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          hostToken,
          topic: topic.trim(),
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          style,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      setError('Failed to generate titles. Check your API key and try again.');
    } finally {
      setLoading(false);
    }
  };

  const applyTitle = async (title: string) => {
    setApplying(title);
    try {
      const res = await fetch(`${API}/api/ai/title/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, hostToken, title }),
      });
      if (!res.ok) throw new Error('Failed to apply');
      setApplied(title);
      onTitleApplied?.(title);
      setTimeout(() => setApplied(null), 3000);
    } catch {
      setError('Failed to apply title');
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#ff3520]" />
          <span className="text-white font-semibold text-sm">AI Title Generator</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Input */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              Stream Topic
            </label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="What's your stream about? e.g. 'Ranking all Minecraft biomes live'"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#ff3520]/50 resize-none"
            />
          </div>

          {/* Advanced options toggle */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-zinc-500 text-xs hover:text-zinc-300 transition-colors self-start"
          >
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Advanced options
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden flex flex-col gap-3"
              >
                <div>
                  <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
                    Keywords (comma-separated)
                  </label>
                  <input
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                    placeholder="gaming, tutorial, 2025…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#ff3520]/50"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
                    Style
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLES.map(s => (
                      <button
                        key={s}
                        onClick={() => setStyle(s)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all capitalize
                          ${style === s
                            ? STYLE_COLORS[s] || 'text-white bg-[#ff3520]/20 border-[#ff3520]/40'
                            : 'text-zinc-500 bg-white/5 border-white/10 hover:text-zinc-200'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#ff3520] to-[#ff6b20] text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-all"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Generating with AI…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                {suggestions.length > 0 ? 'Regenerate Titles' : 'Generate Titles'}
              </>
            )}
          </button>
        </div>

        {/* Suggestions */}
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2"
            >
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                {suggestions.length} Suggestions
              </p>

              {suggestions.map((s, i) => (
                <motion.div
                  key={`${s.title}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`relative bg-white/3 border rounded-xl p-3.5 transition-all group
                    ${applied === s.title
                      ? 'border-green-500/40 bg-green-500/10'
                      : 'border-white/10 hover:border-white/20'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium capitalize
                          ${STYLE_COLORS[s.style] || 'text-zinc-400 bg-white/5 border-white/10'}`}>
                          {s.style}
                        </span>
                        {applied === s.title && (
                          <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
                            <Check className="w-3 h-3" /> Applied
                          </span>
                        )}
                      </div>
                      <p className="text-white font-semibold text-sm leading-snug">{s.title}</p>
                      {s.hook && (
                        <p className="text-zinc-500 text-xs mt-1 italic leading-relaxed">{s.hook}</p>
                      )}
                    </div>
                    <button
                      onClick={() => applyTitle(s.title)}
                      disabled={!!applying || applied === s.title}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                        ${applied === s.title
                          ? 'bg-green-500/20 text-green-400 cursor-default'
                          : 'bg-[#ff3520]/10 border border-[#ff3520]/30 text-[#ff3520] hover:bg-[#ff3520]/20 disabled:opacity-40'}`}
                    >
                      {applying === s.title ? (
                        <div className="w-3 h-3 border border-current/40 border-t-current rounded-full animate-spin" />
                      ) : applied === s.title ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      {applied === s.title ? 'Applied' : 'Use'}
                    </button>
                  </div>
                </motion.div>
              ))}

              <button
                onClick={generate}
                disabled={loading}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 text-zinc-400 text-xs hover:border-white/20 hover:text-zinc-200 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
