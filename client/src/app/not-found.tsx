'use client';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();
  return (
    <div
      className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center px-4 text-center"
      style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}
    >
      <img src="/logo.png" alt="Stream Vault" className="w-10 h-10 object-contain mb-5" />
      <p className="text-6xl font-bold tracking-tight mb-2" style={{ letterSpacing: '-0.03em' }}>404</p>
      <h1 className="text-xl font-bold mb-2">This page doesn&apos;t exist</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-8">
        The page you&apos;re looking for may have moved or never existed.
      </p>
      <button
        onClick={() => router.push('/')}
        className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors mb-10"
      >
        Back to home
      </button>
      <div className="text-xs text-gray-400 dark:text-gray-600">
        <span className="font-semibold text-gray-500 dark:text-gray-500">Stream Vault</span>
        <span className="mx-1.5">·</span>
        <span>by Aligncraft</span>
      </div>
    </div>
  );
}
