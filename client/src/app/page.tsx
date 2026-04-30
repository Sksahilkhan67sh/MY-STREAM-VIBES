'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ThemeToggle } from '@/components/ThemeContext';

const FEATURES = [
  { icon: '⚡', title: 'Instant streams', desc: 'One click to go live. Share a link. Done.' },
  { icon: '🔒', title: 'Private by default', desc: 'Password-protect any stream. No accounts needed.' },
  { icon: '🌐', title: 'Go social', desc: 'Restream to YouTube and Instagram simultaneously.' },
  { icon: '💬', title: 'Live interaction', desc: 'Real-time chat, emoji reactions, and polls.' },
  { icon: '⏺', title: 'Record everything', desc: 'Download your stream as a video file instantly.' },
  { icon: '🎨', title: 'Color grading', desc: '10 presets or manual controls for your look.' },
];

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] as any },
});

export default function HomePage() {
  const router = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-bold text-lg tracking-tight">StreamVault</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => router.push('/host')}
            className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Start streaming →
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-8 pt-24 pb-20 text-center">
        <motion.div {...fade(0)}>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Free to use · No account required
          </span>
        </motion.div>

        <motion.h1
          {...fade(0.1)}
          className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6"
          style={{ letterSpacing: '-0.03em' }}
        >
          Stream privately.<br />
          <span className="text-red-500">Share instantly.</span>
        </motion.h1>

        <motion.p
          {...fade(0.2)}
          className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed"
        >
          Create a private live stream in seconds. Share a link. No accounts, no downloads, no friction.
        </motion.p>

        <motion.div {...fade(0.3)} className="flex items-center justify-center gap-3">
          <button
            onClick={() => router.push('/host')}
            className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
          >
            Start streaming
          </button>
          <button
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-6 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            See features
          </button>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 py-20 transition-colors duration-200">
        <div className="max-w-3xl mx-auto px-8">
          <motion.h2
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center mb-12"
          >
            How it works
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Create a stream', desc: 'Enter a title and optional password. Done in 3 seconds.' },
              { step: '02', title: 'Go live', desc: 'Enable your camera or screen. Your stream starts immediately.' },
              { step: '03', title: 'Share the link', desc: 'Send the viewer URL to anyone. They join instantly.' },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.5 }} viewport={{ once: true }}
              >
                <div className="text-xs font-bold text-red-400 mb-3">{item.step}</div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{item.title}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="max-w-3xl mx-auto px-8">
          <motion.h2
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center mb-12"
          >
            Everything included
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }} viewport={{ once: true }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className={`p-5 rounded-xl border transition-all cursor-default ${
                  hovered === i
                    ? 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
                    : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900'}`}
              >
                <div className="text-xl mb-3">{f.icon}</div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1">{f.title}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-100 dark:border-gray-800 py-20 transition-colors duration-200">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }} viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold tracking-tight mb-4" style={{ letterSpacing: '-0.02em' }}>
              Ready to go live?
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">No sign-up. No credit card. Just stream.</p>
            <button
              onClick={() => router.push('/host')}
              className="px-8 py-3.5 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors"
            >
              Start your stream →
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-8 px-8 transition-colors duration-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-gray-400 dark:text-gray-600">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span>StreamVault</span>
          </div>
          <span>Private live streaming · Free forever</span>
        </div>
      </footer>
    </div>
  );
}
