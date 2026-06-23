'use client';
import { useRouter } from 'next/navigation';

/**
 * Shared footer for signed-in viewer surfaces (feed, settings, search, etc).
 * Replaces the markup that used to be copy-pasted per page so the
 * "Powered by Aligncraft" line stays consistent everywhere it appears.
 *
 * Intentionally minimal — no extra links, no new nav. Matches the
 * existing footer's visual weight exactly (same classes, same sizing).
 */
export default function ViewerFooter() {
  const router = useRouter();
  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 py-6 px-4 sm:px-8 mt-6">
      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 justify-between text-xs text-gray-400 dark:text-gray-600">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Stream Vault" className="w-5 h-5 object-contain" />
          <span>Stream Vault</span>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span>Powered by Aligncraft</span>
        </div>
        <button onClick={() => router.push('/about')} className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          About Stream Vault
        </button>
      </div>
    </footer>
  );
}
