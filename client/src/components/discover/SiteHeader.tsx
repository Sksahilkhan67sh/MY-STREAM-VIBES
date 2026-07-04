'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Bookmark, Users, Crown, History, Settings, LogOut, ChevronDown, Compass } from 'lucide-react';
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

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const PROFILE_LINKS = [
    { href: '/profile', label: 'My Profile', icon: Users },
    { href: '/watch-later', label: 'Watch Later', icon: Bookmark },
    { href: '/history', label: 'Watch History', icon: History },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-3 sm:gap-6 px-4 sm:px-8 py-3">
        <button onClick={() => router.push('/feed')} className="flex items-center gap-2 flex-shrink-0">
          <img src="/logo.png" alt="StreamVault" className="w-7 h-7 object-contain" />
          <span className="font-bold text-base tracking-tight hidden sm:inline">StreamVault</span>
        </button>

        {/* Primary nav — Home is the logo above; Discover/Following/Subscriptions here */}
        {status === 'authenticated' && userId && (
          <nav className="hidden md:flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => router.push('/search')}
              className="px-2.5 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5" /> Discover
            </button>
            <button
              onClick={() => router.push('/following')}
              className="px-2.5 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Following
            </button>
            <button
              onClick={() => router.push('/subscriptions')}
              className="px-2.5 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              Subscriptions
            </button>
          </nav>
        )}

        <div className="flex-1 max-w-md">
          <SearchBar initialValue={searchValue} placeholder={t('search_placeholder')} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <LanguageSwitcher />
          <ThemeToggle />
          {status === 'authenticated' && userId && (
            <>
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
                  className="hidden sm:block px-3.5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs sm:text-sm font-semibold rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  Become Creator
                </button>
              )}

              {/* Profile dropdown */}
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen(o => !o)}
                  aria-label="Account menu"
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                  className="flex items-center gap-1.5 p-0.5 pr-1.5 rounded-full hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  {session?.user?.image ? (
                    <img src={session.user.image} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-500">{(session?.user?.name || session?.user?.email || '?')[0].toUpperCase()}</span>
                    </div>
                  )}
                  <ChevronDown className="w-3 h-3 text-gray-400 hidden sm:block" />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-11 w-52 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5">
                    <div className="px-3.5 py-2 border-b border-gray-50 dark:border-gray-800 mb-1">
                      <p className="text-sm font-semibold truncate">{session?.user?.name || 'Your account'}</p>
                      <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                    </div>
                    {PROFILE_LINKS.map(l => (
                      <button
                        key={l.href}
                        onClick={() => { setProfileOpen(false); router.push(l.href); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <l.icon className="w-4 h-4 text-gray-400" /> {l.label}
                      </button>
                    ))}
                    <button
                      onClick={() => { setProfileOpen(false); router.push('/friends'); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                      <Users className="w-4 h-4 text-gray-400" /> {t('friends')}
                    </button>
                    <div className="border-t border-gray-50 dark:border-gray-800 mt-1 pt-1">
                      <button
                        onClick={() => { setProfileOpen(false); signOut({ callbackUrl: '/' }); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" /> Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
