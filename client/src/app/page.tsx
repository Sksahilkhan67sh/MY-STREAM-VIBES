'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Zap, Lock, Link2, Video, Radio, Users } from 'lucide-react';

const features = [
  { icon: Lock,  title: 'E2E Encrypted',    desc: 'WebRTC DTLS-SRTP by default. Zero config.' },
  { icon: Zap,   title: '<150ms Latency',   desc: 'LiveKit SFU with adaptive bitrate streaming.' },
  { icon: Link2, title: 'Zero Friction',    desc: 'Share a link. No accounts. No downloads.' },
  { icon: Video, title: 'Screen + Camera',  desc: 'Capture anything — game, webcam, or both.' },
  { icon: Radio, title: 'Live Recording',   desc: 'Server-side MP4 capture to S3 with one click.' },
  { icon: Users, title: '10,000+ Viewers',  desc: 'Auto-scaling via LiveKit Cloud.' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-600/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-brand-800/10 blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">StreamVault</span>
        </div>
        <Link href="/host">
          <button className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors">
            Go Live →
          </button>
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs font-medium text-zinc-400 mb-6">
            <span className="live-dot" /> WebRTC · No signup · Instant
          </span>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-[0.95]">
            Stream privately.<br />
            <span className="text-brand-500">Share instantly.</span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
            Create a private live stream in seconds. Share a link. No accounts,
            no friction — end-to-end encrypted by default.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/host">
              <button className="px-8 py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-brand-500/20">
                Create a Stream
              </button>
            </Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <button className="px-8 py-3.5 glass hover:bg-white/[0.07] text-zinc-300 font-semibold rounded-xl transition-all border border-white/10">
                View on GitHub
              </button>
            </a>
          </div>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-24 max-w-4xl w-full"
        >
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl p-5 text-left hover:bg-white/[0.06] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-3">
                <Icon className="w-4 h-4 text-brand-400" />
              </div>
              <h3 className="font-semibold text-sm text-zinc-100 mb-1">{title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </motion.div>
      </section>

      <footer className="relative z-10 text-center py-6 text-zinc-600 text-xs">
        Built with LiveKit · Socket.io · Next.js
      </footer>
    </main>
  );
}
