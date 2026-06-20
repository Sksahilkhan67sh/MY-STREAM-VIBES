'use client';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ThemeToggle } from '@/components/ThemeContext';
import SearchBar from './SearchBar';
import NotificationBell from '@/components/NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';
import { useI18n } from '@/components/I18nContext';
import { useUserRole } from '@/hooks/useUserRole';

export default function SiteHeader({ searchValue }: { searchValue?: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';
  const { t } = useI18n();
  const { isCreator, isViewer, loading: roleLoading } = useUserRole();

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-3 sm:gap-6 px-4 sm:px-8 py-3">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 flex-shrink-0">
          <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-base tracking-tight hidden sm:inline">StreamVault</span>
        </button>

        <div className="flex-1 max-w-md">
          <SearchBar initialValue={searchValue} placeholder={t('search_placeholder')} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <LanguageSwitcher />
          <ThemeToggle />
          {status === 'authenticated' && userId && (
            <>
              <button
                onClick={() => router.push('/watch-later')}
                className="hidden md:block px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {t('watch_later')}
              </button>
              <button
                onClick={() => router.push('/friends')}
                className="hidden md:block px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {t('friends')}
              </button>
              <NotificationBell userId={userId} />
              {/* Role-aware CTA — while role is still loading, fall back to the
                  original always-visible Studio/Go Live buttons so there is no
                  layout flash or regression for existing creators on slow loads. */}
              {(roleLoading || isCreator) && (
                <>
                  <button
                    onClick={() => router.push('/studio')}
                    className="hidden sm:block px-3.5 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    {t('studio')}
                  </button>
                  <button
                    onClick={() => router.push('/studio')}
                    className="px-3.5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs sm:text-sm font-semibold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors whitespace-nowrap"
                  >
                    {t('go_live')}
                  </button>
                </>
              )}
              {!roleLoading && isViewer && (
                <button
                  onClick={() => router.push('/become-creator')}
                  className="px-3.5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs sm:text-sm font-semibold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  Become Creator
                </button>
              )}
            </>
          )}
          {status !== 'authenticated' && (
            <button
              onClick={() => router.push('/login')}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors whitespace-nowrap"
            >
              {t('sign_in')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
