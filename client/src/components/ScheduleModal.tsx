'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Bell, ChevronRight } from 'lucide-react';

interface ScheduleModalProps {
  title: string;
  onClose: () => void;
  onSchedule: (datetime: string) => void;
}

export default function ScheduleModal({ title, onClose, onSchedule }: ScheduleModalProps) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const defaultDt = now.toISOString().slice(0, 16);
  const [datetime, setDatetime] = useState(defaultDt);
  const [step, setStep] = useState<'datetime' | 'confirm'>('datetime');
  const [loading, setLoading] = useState(false);

  const parsedDate = (() => {
    if (!datetime) return null;
    const [datePart, timePart] = datetime.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute);
  })();

  const isValid = parsedDate && !isNaN(parsedDate.getTime()) && parsedDate > new Date();

  const handleNext = () => {
    if (!isValid) { alert('Please choose a future date and time.'); return; }
    setStep('confirm');
  };

  const handleSchedule = async () => {
    if (!parsedDate || !isValid) return;
    setLoading(true);
    setTimeout(() => { onSchedule(parsedDate.toISOString()); setLoading(false); }, 400);
  };

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const msUntil = parsedDate ? parsedDate.getTime() - Date.now() : 0;
  const hoursUntil = Math.floor(msUntil / 3600000);
  const minutesUntil = Math.floor((msUntil % 3600000) / 60000);
  const countdownLabel = hoursUntil > 24
    ? `${Math.floor(hoursUntil / 24)}d ${hoursUntil % 24}h from now`
    : hoursUntil > 0 ? `${hoursUntil}h ${minutesUntil}m from now`
    : `${minutesUntil}m from now`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative w-full max-w-sm overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #111113 0%, #0d0d10 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,53,32,0.1)',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, #ff3520, transparent)' }} />

        <div className="flex items-center justify-between px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,53,32,0.12)', border: '1px solid rgba(255,53,32,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar className="w-4 h-4 text-[#ff3520]" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-zinc-100">Schedule Stream</h2>
              <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[160px]">{title}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {step === 'datetime' ? (
            <motion.div key="datetime" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="px-6 pb-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'rgba(161,161,170,0.7)' }}>
                  Date & Time <span style={{ color: 'rgba(161,161,170,0.4)', textTransform: 'none', fontWeight: 400 }}>({timeZone})</span>
                </label>
                <input
                  type="datetime-local"
                  value={datetime}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={e => setDatetime(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors text-zinc-200"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                />
              </div>
              {isValid && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,53,32,0.07)', border: '1px solid rgba(255,53,32,0.15)' }}>
                  <Clock className="w-3.5 h-3.5 text-[#ff3520] shrink-0" />
                  <span className="text-xs text-zinc-400">{countdownLabel}</span>
                </motion.div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-500 hover:text-zinc-300 transition-colors" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>Cancel</button>
                <button onClick={handleNext} disabled={!isValid} className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5" style={{ background: isValid ? 'linear-gradient(135deg, #ff3520, #c81405)' : 'rgba(255,255,255,0.05)', color: isValid ? 'white' : 'rgba(255,255,255,0.2)', cursor: isValid ? 'pointer' : 'not-allowed' }}>
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="px-6 pb-6 space-y-4">
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Date</span>
                  <span className="text-sm text-zinc-200 font-medium">{parsedDate ? formatDate(parsedDate) : '—'}</span>
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Time</span>
                  <span className="text-sm text-zinc-200 font-medium">{parsedDate ? formatTime(parsedDate) : '—'}</span>
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Until</span>
                  <span className="text-sm font-semibold" style={{ color: '#ff3520' }}>{countdownLabel}</span>
                </div>
              </div>
              <div className="rounded-xl p-3 flex items-start gap-3" style={{ background: 'rgba(255,193,7,0.06)', border: '1px solid rgba(255,193,7,0.15)' }}>
                <Bell className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#ffc107' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,193,7,0.8)' }}>
                  Viewers who open your stream link will be notified <strong>5 minutes before</strong> you go live.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('datetime')} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-500 hover:text-zinc-300 transition-colors" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
                <button onClick={handleSchedule} disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all" style={{ background: 'linear-gradient(135deg, #ff3520, #c81405)', opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Scheduling…' : 'Schedule Stream'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
