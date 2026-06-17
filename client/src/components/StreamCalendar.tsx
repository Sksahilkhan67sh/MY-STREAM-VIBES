'use client';
/**
 * client/src/components/StreamCalendar.tsx
 * Feature 1: Stream Scheduling Calendar
 *
 * Full calendar view of scheduled & past streams.
 * Used in: /host page (via a "Calendar" tab or modal).
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Radio, X,
  Plus, Eye, Trash2,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface ScheduledStream {
  id: string;
  roomId: string;
  title: string;
  scheduledAt: string;
  isLive: boolean;
  expiresAt: string;
  thumbnailUrl?: string;
}

interface StreamCalendarProps {
  userId: string;
  onClose: () => void;
  onCreateScheduled?: (datetime: string) => void;
}

const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function StreamCalendar({ userId, onClose, onCreateScheduled }: StreamCalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [streams, setStreams] = useState<ScheduledStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTime, setPickerTime] = useState('12:00');

  const fetchStreams = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch from analytics or stream list endpoint
      const res = await fetch(`${API}/api/streams?userId=${userId}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setStreams(data.streams || []);
      }
    } catch {
      // silently fail — calendar still renders
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchStreams(); }, [fetchStreams]);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const streamsOnDay = (day: number) => {
    return streams.filter(s => {
      const d = new Date(s.scheduledAt || s.expiresAt);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  };

  const handleDayClick = (day: number) => {
    setSelected(new Date(year, month, day));
    setShowPicker(false);
  };

  const handleScheduleClick = () => {
    if (!selected) return;
    const [h, m] = pickerTime.split(':').map(Number);
    const dt = new Date(selected);
    dt.setHours(h, m, 0, 0);
    if (dt <= new Date()) { alert('Please choose a future date and time.'); return; }
    onCreateScheduled?.(dt.toISOString());
    onClose();
  };

  const selectedStreams = selected
    ? streams.filter(s => {
        const d = new Date(s.scheduledAt || '');
        return (
          d.getFullYear() === selected.getFullYear() &&
          d.getMonth() === selected.getMonth() &&
          d.getDate() === selected.getDate()
        );
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-2xl bg-[#0d0d0d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#ff3520]" />
            <h2 className="text-white font-bold text-lg">Stream Calendar</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Calendar */}
          <div className="flex-1 p-6">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-white font-semibold">{MONTHS[month]} {year}</span>
              <button
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-zinc-500 py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} />;
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                const isSelected = selected?.getDate() === day && selected?.getMonth() === month && selected?.getFullYear() === year;
                const dayStreams = streamsOnDay(day);
                const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                return (
                  <button
                    key={day}
                    onClick={() => handleDayClick(day)}
                    className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-medium transition-all
                      ${isSelected ? 'bg-[#ff3520] text-white' : isToday ? 'bg-white/10 text-white' : isPast ? 'text-zinc-600 hover:bg-white/5' : 'text-zinc-300 hover:bg-white/10'}
                    `}
                  >
                    {day}
                    {dayStreams.length > 0 && (
                      <div className="absolute bottom-1 flex gap-0.5">
                        {dayStreams.slice(0, 3).map((_, di) => (
                          <div key={di} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[#ff3520]'}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right panel: selected day */}
          <div className="w-full md:w-64 border-t md:border-t-0 md:border-l border-white/10 p-6 flex flex-col gap-4">
            {selected ? (
              <>
                <div>
                  <p className="text-zinc-400 text-xs uppercase tracking-wider font-semibold mb-1">
                    {selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  {selectedStreams.length > 0 ? (
                    <div className="flex flex-col gap-2 mt-3">
                      {selectedStreams.map(s => (
                        <div key={s.id} className="bg-white/5 rounded-xl p-3 border border-white/10">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-white text-sm font-semibold line-clamp-2">{s.title}</p>
                              <p className="text-zinc-500 text-xs mt-1">
                                {new Date(s.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            </div>
                            {s.isLive && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-red-400 text-xs font-bold">LIVE</span>
                              </div>
                            )}
                          </div>
                          <a
                            href={`${APP_URL}/s/${s.roomId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center gap-1 text-[#ff3520] text-xs hover:underline"
                          >
                            <Eye className="w-3 h-3" /> View stream
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-600 text-sm mt-2">No streams scheduled</p>
                  )}
                </div>

                {/* Schedule new stream on this day */}
                {new Date(year, month, selected.getDate()) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()) && (
                  <div className="mt-auto">
                    {showPicker ? (
                      <div className="flex flex-col gap-3">
                        <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Time</label>
                        <input
                          type="time"
                          value={pickerTime}
                          onChange={e => setPickerTime(e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#ff3520]/50"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowPicker(false)}
                            className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleScheduleClick}
                            className="flex-1 py-2 rounded-lg bg-[#ff3520] text-white text-sm font-semibold hover:bg-[#e02e1a] transition-colors"
                          >
                            Schedule
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowPicker(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#ff3520]/10 border border-[#ff3520]/30 text-[#ff3520] text-sm font-semibold hover:bg-[#ff3520]/20 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Schedule Stream
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <Calendar className="w-8 h-8 text-zinc-700" />
                <p className="text-zinc-600 text-sm">Click a day to see or schedule streams</p>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 border-t border-white/10 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#ff3520]" />
            <span className="text-zinc-500 text-xs">Scheduled stream</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-white/30" />
            <span className="text-zinc-500 text-xs">Today</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
