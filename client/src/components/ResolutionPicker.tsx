'use client';
import { useState } from 'react';
import { Monitor, ChevronDown, ChevronUp, Zap, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface Resolution {
  label:       string;
  tag:         string;
  width:       number;
  height:      number;
  frameRate:   number;
  bitrate:     number;
  description: string;
  tier:        'low' | 'mid' | 'high' | 'ultra';
}

export const RESOLUTIONS: Resolution[] = [
  { label:'140p',  tag:'140p', width:256,  height:140,  frameRate:15, bitrate:150,   description:'Ultra low — dial-up / very poor connection', tier:'low'   },
  { label:'360p',  tag:'360p', width:640,  height:360,  frameRate:24, bitrate:500,   description:'Low bandwidth — mobile networks',             tier:'low'   },
  { label:'480p',  tag:'SD',   width:854,  height:480,  frameRate:30, bitrate:1000,  description:'Standard definition',                         tier:'mid'   },
  { label:'720p',  tag:'HD',   width:1280, height:720,  frameRate:30, bitrate:2500,  description:'HD — recommended for most streams',           tier:'mid'   },
  { label:'1080p', tag:'FHD',  width:1920, height:1080, frameRate:30, bitrate:4500,  description:'Full HD — great quality',                     tier:'high'  },
  { label:'2K',    tag:'2K',   width:2560, height:1440, frameRate:30, bitrate:8000,  description:'QHD — needs fast upload',                     tier:'high'  },
  { label:'4K',    tag:'4K',   width:3840, height:2160, frameRate:30, bitrate:15000, description:'Ultra HD — requires 15+ Mbps upload',         tier:'ultra' },
];

export const DEFAULT_RESOLUTION = RESOLUTIONS[3]; // 720p

const TIER_COLOR: Record<string, string> = {
  low:   'text-blue-400 bg-blue-500/10 border-blue-500/30',
  mid:   'text-green-400 bg-green-500/10 border-green-500/30',
  high:  'text-amber-400 bg-amber-500/10 border-amber-500/30',
  ultra: 'text-red-400 bg-red-500/10 border-red-500/30',
};

interface ResolutionPickerProps {
  value:     Resolution;
  onChange:  (r: Resolution) => void;
  disabled?: boolean;
}

export default function ResolutionPicker({ value, onChange, disabled }: ResolutionPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-800/50'}`}
      >
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-brand-500" />
          <span className="font-bold text-sm text-zinc-200">Resolution</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${TIER_COLOR[value.tier]}`}>
            {value.tag}
          </span>
          <span className="text-xs text-zinc-600 hidden sm:inline">{value.width}×{value.height}</span>
        </div>
        {disabled
          ? <span className="text-xs text-zinc-600 italic">stop stream to change</span>
          : open
            ? <ChevronUp className="w-4 h-4 text-zinc-500" />
            : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ height:0, opacity:0 }}
            animate={{ height:'auto', opacity:1 }}
            exit={{ height:0, opacity:0 }}
            transition={{ duration:0.2 }}
            className="overflow-hidden border-t border-zinc-800"
          >
            <div className="p-3 space-y-1.5">
              <div className="flex items-start gap-2 bg-zinc-800/50 rounded-xl px-3 py-2 mb-2">
                <Cpu className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Higher resolutions use more upload bandwidth and CPU.
                  Set before going live — cannot change mid-stream.
                </p>
              </div>

              {RESOLUTIONS.map(r => {
                const isSelected = r.label === value.label;
                const bpsLabel = r.bitrate >= 1000
                  ? `~${(r.bitrate / 1000).toFixed(1)} Mbps`
                  : `~${r.bitrate} Kbps`;
                return (
                  <button
                    key={r.label}
                    onClick={() => { onChange(r); setOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all
                      ${isSelected
                        ? 'bg-brand-500/12 border-brand-500/40'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-bold flex-shrink-0 min-w-[38px] text-center ${TIER_COLOR[r.tier]}`}>
                        {r.tag}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold ${isSelected ? 'text-brand-300' : 'text-zinc-300'}`}>
                            {r.label}
                          </p>
                          <span className="text-xs text-zinc-600">{r.width}×{r.height} @ {r.frameRate}fps</span>
                        </div>
                        <p className="text-xs text-zinc-600 truncate">{r.description}</p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-3 text-right">
                      <p className="text-xs text-zinc-500 font-mono">{bpsLabel}</p>
                      {isSelected && <p className="text-xs text-brand-400 font-bold">✓ Active</p>}
                    </div>
                  </button>
                );
              })}

              {(value.tier === 'high' || value.tier === 'ultra') && (
                <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2 mt-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400/90 leading-relaxed">
                    {value.tier === 'ultra'
                      ? '4K requires 15+ Mbps stable upload. Most home connections will drop frames. Only use on gigabit fibre.'
                      : '1080p / 2K needs 4–8 Mbps upload. Use a wired connection for best stability.'}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
