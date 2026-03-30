'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar } from 'lucide-react';

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

  const handleSubmit = () => {
    if (!datetime) return;
    onSchedule(new Date(datetime).toISOString());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass rounded-2xl p-6 w-full max-w-sm"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-400" />
            <h2 className="font-bold text-base">Schedule Stream</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Stream title</p>
            <p className="font-semibold text-sm">{title}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Date & Time</label>
            <input
              type="datetime-local"
              value={datetime}
              min={new Date().toISOString().slice(0, 16)}
              onChange={e => setDatetime(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 transition-colors text-zinc-300 [color-scheme:dark]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 glass rounded-xl text-sm font-semibold text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-800">
              Cancel
            </button>
            <button onClick={handleSubmit} className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 rounded-xl text-sm font-bold text-white transition-colors">
              Schedule →
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
