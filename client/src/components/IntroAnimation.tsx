'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface IntroAnimationProps {
  onComplete: () => void;
}

export default function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const [exiting, setExiting] = useState(false);
  const [latency,  setLatency]  = useState(0);
  const [viewers,  setViewers]  = useState(0);

  useEffect(() => {
    const animCounter = (setter: (v: number) => void, target: number, duration: number, delay: number) => {
      setTimeout(() => {
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          setter(Math.floor(p * p * target));
          if (p < 1) requestAnimationFrame(step); else setter(target);
        };
        requestAnimationFrame(step);
      }, delay);
    };
    animCounter(setLatency, 148, 900, 1700);
    animCounter(setViewers, 2847, 1400, 1750);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const sp = 48;
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W + sp; x += sp) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H + sp; y += sp) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      t += 0.02;
      const cx = W / 2, cy = H / 2;
      ctx.fillStyle = 'rgba(239,68,68,0.4)';
      for (let gx = Math.round((cx - 200) / sp) * sp; gx < cx + 220; gx += sp) {
        for (let gy = Math.round((cy - 160) / sp) * sp; gy < cy + 180; gy += sp) {
          const dx = (gx - cx) / 200, dy = (gy - cy) / 180;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const wave = Math.sin(t - dist * 3.5) * 0.5 + 0.5;
          const r = wave * 2.5 * Math.max(0, 1 - dist * 0.8);
          if (r > 0.3) {
            ctx.globalAlpha = wave * 0.5 * Math.max(0, 1 - dist * 0.7);
            ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  const handleEnter = () => {
    setExiting(true);
    setTimeout(onComplete, 500);
  };

  return (
    <AnimatePresence>
      {!exiting ? (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-white overflow-hidden"
          style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
          onClick={handleEnter}
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {/* Corner marks */}
          {['top-6 left-6', 'top-6 right-6', 'bottom-6 left-6', 'bottom-6 right-6'].map((pos, i) => (
            <motion.div
              key={i}
              className={`absolute w-5 h-5 ${pos}`}
              style={{
                borderTop:    i < 2 ? '1.5px solid #e5e7eb' : undefined,
                borderBottom: i >= 2 ? '1.5px solid #e5e7eb' : undefined,
                borderLeft:   i % 2 === 0 ? '1.5px solid #e5e7eb' : undefined,
                borderRight:  i % 2 === 1 ? '1.5px solid #e5e7eb' : undefined,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
            />
          ))}

          <div
            className="relative z-10 flex flex-col items-center text-center px-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Live dot */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="w-2 h-2 rounded-full bg-red-500 mb-8"
              style={{ boxShadow: '0 0 0 4px rgba(239,68,68,0.15)' }}
            />

            {/* STREAM */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-gray-900 font-bold leading-none"
              style={{ fontSize: 'clamp(52px, 10vw, 80px)', letterSpacing: '-0.04em' }}
            >
              STREAM
            </motion.div>

            {/* VAULT */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-red-500 font-bold leading-none"
              style={{ fontSize: 'clamp(52px, 10vw, 80px)', letterSpacing: '-0.04em' }}
            >
              VAULT
            </motion.div>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85, duration: 0.5 }}
              className="text-xs text-gray-400 tracking-widest uppercase mt-5"
              style={{ letterSpacing: '0.2em' }}
            >
              Private · Instant · Encrypted
            </motion.p>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.4 }}
              className="flex items-center gap-8 mt-8"
            >
              {[
                { value: `${latency}ms`, label: 'Latency' },
                { value: viewers.toLocaleString(), label: 'Viewers' },
                { value: '720p', label: 'Default' },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <div className="text-sm font-bold text-gray-900 tabular-nums">{value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{label}</div>
                </div>
              ))}
            </motion.div>

            {/* Enter button */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.4 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleEnter}
              className="mt-10 px-8 py-3 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
            >
              Enter studio →
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.6, duration: 0.4 }}
              className="text-xs text-gray-300 mt-4"
            >
              or click anywhere to skip
            </motion.p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
