'use client';

// components/navigation/MobileBottomNav.tsx
//
// Section 11 of the UX brief asks for a mobile bottom nav for viewers.
// Real gap this fixes: SiteHeader's Discover / Following / Subscriptions
// links are wrapped in `hidden md:flex` (see components/discover/SiteHeader.tsx)
// — on a phone those three destinations are currently only reachable by
// typing a URL directly. This component surfaces them as a persistent
// bottom bar on small screens, on viewer-facing routes only.
//
// Deliberately route-aware and self-mounted from the root layout rather
// than added per-page: every viewer page benefits with a single addition,
// and it correctly disappears on routes where it would get in the way
// (the video watch page, Studio's own nav, auth pages, etc.).

import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { Compass, Users, Crown, Home, User } from 'lucide-react';

// Routes where the viewer bottom nav should render. Prefix-matched against
// the current pathname. Kept as an allowlist (rather than a denylist of
// routes to hide it on) so newly-added routes default to NOT showing the
// nav until deliberately opted in — safer than the nav silently appearing
// somewhere it wasn't designed for, like a checkout flow or a modal-style
// route.
const VIEWER_ROUTES = [
  '/feed',
  '/browse',
  '/search',
  '/following',
  '/subscriptions',
  '/profile',
  '/settings',
  '/history',
  '/watch-later',
  '/creator',
];

const NAV_ITEMS = [
  { href: '/feed', label: 'Home', icon: Home, match: (p: string) => p === '/feed' },
  { href: '/search', label: 'Discover', icon: Compass, match: (p: string) => p.startsWith('/search') || p.startsWith('/browse') },
  { href: '/following', label: 'Following', icon: Users, match: (p: string) => p.startsWith('/following') },
  { href: '/subscriptions', label: 'Subscriptions', icon: Crown, match: (p: string) => p.startsWith('/subscriptions') },
  { href: '/profile', label: 'Profile', icon: User, match: (p: string) => p.startsWith('/profile') || p.startsWith('/settings') },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();

  const shouldShow = status === 'authenticated' && VIEWER_ROUTES.some(r => pathname.startsWith(r));

  // Reserve space at the bottom of the page so this fixed bar never covers
  // page content (e.g. a footer CTA or the last item in a scrolling list).
  // Scoped to a body class + media query rather than requiring every page
  // to add its own padding — this bar can start/stop appearing across
  // client-side navigations without every page needing to know about it.
  useEffect(() => {
    if (shouldShow) {
      document.body.classList.add('has-bottom-nav');
    } else {
      document.body.classList.remove('has-bottom-nav');
    }
    return () => document.body.classList.remove('has-bottom-nav');
  }, [shouldShow]);

  if (!shouldShow) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border-t border-gray-100 dark:border-gray-800 pb-safe"
      aria-label="Primary"
    >
      <div className="flex items-stretch justify-between px-1">
        {NAV_ITEMS.map(item => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0"
            >
              <Icon
                className={`w-5 h-5 ${active ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}
                strokeWidth={active ? 2.4 : 2}
              />
              <span
                className={`text-[10px] font-medium truncate max-w-full ${
                  active ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
