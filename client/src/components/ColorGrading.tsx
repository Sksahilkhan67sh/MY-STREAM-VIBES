'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Sliders, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ColorSettings {
  brightness: number;  // -100 to 100
  contrast:   number;  // -100 to 100
  saturation: number;  // -100 to 100
  hue:        number;  // -180 to 180
  warmth:     number;  // -100 to 100 (blue → yellow)
  sharpness:  number;  //  0   to 100
  vignette:   number;  //  0   to 100
}

export interface Preset {
  name:     string;
  emoji:    string;
  settings: ColorSettings;
}

export const DEFAULT_SETTINGS: ColorSettings = {
  brightness: 0,
  contrast:   0,
  saturation: 0,
  hue:        0,
  warmth:     0,
  sharpness:  0,
  vignette:   0,
};

export const PRESETS: Preset[] = [
  { name: 'None',      emoji: '⬜', settings: { ...DEFAULT_SETTINGS } },
  { name: 'Vivid',     emoji: '🌈', settings: { brightness: 5,  contrast: 20, saturation: 40, hue: 0,   warmth: 5,   sharpness: 20, vignette: 0  } },
  { name: 'Cinematic', emoji: '🎬', settings: { brightness: -5, contrast: 30, saturation:-20, hue: 0,   warmth:-15,  sharpness: 10, vignette: 40 } },
  { name: 'Warm',      emoji: '🌅', settings: { brightness: 5,  contrast: 10, saturation: 15, hue: 5,   warmth: 40,  sharpness: 0,  vignette: 10 } },
  { name: 'Cool',      emoji: '❄️', settings: { brightness: 0,  contrast: 15, saturation: 5,  hue:-5,   warmth:-40,  sharpness: 5,  vignette: 15 } },
  { name: 'B&W',       emoji: '⚫', settings: { brightness: 5,  contrast: 25, saturation:-100,hue: 0,   warmth: 0,   sharpness: 20, vignette: 25 } },
  { name: 'Gaming',    emoji: '🎮', settings: { brightness: 10, contrast: 35, saturation: 50, hue: 0,   warmth: 0,   sharpness: 40, vignette: 20 } },
  { name: 'Vintage',   emoji: '📷', settings: { brightness:-5,  contrast:-10, saturation:-30, hue: 10,  warmth: 30,  sharpness: 0,  vignette: 50 } },
  { name: 'Neon',      emoji: '💜', settings: { brightness: 5,  contrast: 40, saturation: 80, hue: 270, warmth:-20,  sharpness: 30, vignette: 30 } },
  { name: 'Matte',     emoji: '🌫️', settings: { brightness: 10, contrast:-20, saturation:-10, hue: 0,   warmth: 5,   sharpness: 0,  vignette: 0  } },
];

// Convert our settings into a CSS filter string
export function buildFilter(s: ColorSettings): string {
  const bright = 1 + s.brightness / 100;
  const cont   = 1 + s.contrast   / 100;
  const sat    = Math.max(0, 1 + s.saturation / 100);
  const hue    = s.hue;
  // warmth shifts hue slightly toward warm or cool tones
  const warmHue = s.warmth * 0.08;
  const sharp  = s.sharpness > 0
    ? `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><filter id='s'><feConvolveMatrix order='3' kernelMatrix='-${(s.sharpness/100).toFixed(2)} -${(s.sharpness/100).toFixed(2)} -${(s.sharpness/100).toFixed(2)} -${(s.sharpness/100).toFixed(2)} ${(1+s.sharpness/12.5).toFixed(2)} -${(s.sharpness/100).toFixed(2)} -${(s.sharpness/100).toFixed(2)} -${(s.sharpness/100).toFixed(2)} -${(s.sharpness/100).toFixed(2)}'/></filter></svg>#s")`
    : '';
  return [
    `brightness(${bright.toFixed(3)})`,
    `contrast(${cont.toFixed(3)})`,
    `saturate(${sat.toFixed(3)})`,
    `hue-rotate(${(hue + warmHue).toFixed(1)}deg)`,
    sharp,
  ].filter(Boolean).join(' ');
}

// Build vignette overlay style
export function buildVignette(strength: number): React.CSSProperties {
  if (strength === 0) return { display: 'none' };
  const alpha = (strength / 100 * 0.75).toFixed(3);
  return {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${alpha}) 100%)`,
    zIndex: 2,
  };
}

interface SliderRowProps {
  label:   string;
  value:   number;
  min:     number;
  max:     number;
  step?:   number;
  onChange:(v: number) => void;
  unit?:   string;
}

function SliderRow({ label, value, min, max, step=1, onChange, unit='' }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="text-brand-400 font-mono font-bold w-10 text-right">
          {value > 0 ? '+' : ''}{value}{unit}
        </span>
      </div>
      <div className="relative h-1.5 bg-zinc-800 rounded-full">
        {/* Zero marker (center for bipolar sliders) */}
        {min < 0 && (
          <div className="absolute top-0 bottom-0 w-px bg-zinc-600"
               style={{ left: `${((0 - min) / (max - min)) * 100}%` }} />
        )}
        {/* Fill */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-brand-500"
          style={min < 0
            ? {
                left:  `${Math.min(((0 - min) / (max - min)) * 100, pct)}%`,
                width: `${Math.abs(pct - ((0 - min) / (max - min)) * 100)}%`,
              }
            : { left: 0, width: `${pct}%` }
          }
        />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          style={{ margin: 0 }}
        />
      </div>
    </div>
  );
}

interface ColorGradingProps {
  settings:  ColorSettings;
  onChange:  (s: ColorSettings) => void;
}

export default function ColorGrading({ settings, onChange }: ColorGradingProps) {
  const [open, setOpen]             = useState(false);
  const [activePreset, setActivePreset] = useState('None');

  const applyPreset = (preset: Preset) => {
    setActivePreset(preset.name);
    onChange({ ...preset.settings });
  };

  const update = (key: keyof ColorSettings, val: number) => {
    setActivePreset('Custom');
    onChange({ ...settings, [key]: val });
  };

  const reset = () => {
    setActivePreset('None');
    onChange({ ...DEFAULT_SETTINGS });
  };

  const isDefault = Object.entries(settings).every(
    ([k, v]) => v === DEFAULT_SETTINGS[k as keyof ColorSettings]
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-brand-500" />
          <span className="font-bold text-sm text-zinc-200">Color Grading</span>
          {!isDefault && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-400 font-semibold">
              {activePreset === 'Custom' ? 'Custom' : activePreset}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp  className="w-4 h-4 text-zinc-500" />
          : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-zinc-800">
              {/* Presets */}
              <div>
                <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mt-3 mb-2">
                  Presets
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESETS.map(p => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p)}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs font-semibold transition-all
                        ${activePreset === p.name
                          ? 'bg-brand-500/15 border border-brand-500/40 text-brand-300'
                          : 'bg-zinc-800 border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'}`}
                    >
                      <span className="text-base leading-none">{p.emoji}</span>
                      <span className="text-[10px] leading-none">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual sliders */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                    Manual Adjustments
                  </p>
                  {!isDefault && (
                    <button
                      onClick={reset}
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  )}
                </div>

                <SliderRow label="Brightness" value={settings.brightness} min={-100} max={100} onChange={v => update('brightness', v)} />
                <SliderRow label="Contrast"   value={settings.contrast}   min={-100} max={100} onChange={v => update('contrast',   v)} />
                <SliderRow label="Saturation" value={settings.saturation} min={-100} max={100} onChange={v => update('saturation', v)} />
                <SliderRow label="Hue Shift"  value={settings.hue}        min={-180} max={180} onChange={v => update('hue',        v)} unit="°" />
                <SliderRow label="Warmth"     value={settings.warmth}     min={-100} max={100} onChange={v => update('warmth',     v)} />
                <SliderRow label="Sharpness"  value={settings.sharpness}  min={0}    max={100} onChange={v => update('sharpness',  v)} />
                <SliderRow label="Vignette"   value={settings.vignette}   min={0}    max={100} onChange={v => update('vignette',   v)} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
