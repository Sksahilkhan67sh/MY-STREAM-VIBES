'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function LegalPageShell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
    >
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100 dark:border-gray-800">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Stream Vault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-base sm:text-lg tracking-tight">Stream Vault</span>
        </a>
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      </nav>

      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-12 sm:py-16">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8" style={{ letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <div className="prose-sm text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-4">
          {children}
        </div>
      </main>

      <footer className="border-t border-gray-100 dark:border-gray-800 py-6 px-4 sm:px-8">
        <p className="max-w-2xl mx-auto text-xs text-gray-400 dark:text-gray-600">
          © 2026 Aligncraft. All Rights Reserved. · Creator Platform by Aligncraft
        </p>
      </footer>
    </div>
  );
}
