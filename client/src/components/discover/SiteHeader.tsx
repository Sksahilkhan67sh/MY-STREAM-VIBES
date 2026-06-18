'use client';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ThemeToggle } from '@/components/ThemeContext';
import SearchBar from './SearchBar';

export default function SiteHeader({ searchValue }: { searchValue?: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-3 sm:gap-6 px-4 sm:px-8 py-3">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 flex-shrink-0">
          <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-base tracking-tight hidden sm:inline">StreamVault</span>
        </button>

        <div className="flex-1 max-w-md">
          <SearchBar initialValue={searchValue} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <ThemeToggle />
          {status === 'authenticated' ? (
            <button
              onClick={() => router.push('/host')}
              className="px-3.5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs sm:text-sm font-semibold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors whitespace-nowrap"
            >
              Go live
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors whitespace-nowrap"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
