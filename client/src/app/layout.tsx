import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeContext';
import { SessionProvider } from 'next-auth/react';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { I18nProvider } from '@/components/I18nContext';
import { NotificationSocketProvider } from '@/components/NotificationSocketContext';
import NotificationToastHost from '@/components/NotificationToastHost';

export const metadata: Metadata = {
  metadataBase: new URL('https://my-stream-vibes-client.vercel.app'),
  title: 'StreamVault — Discover Live Streams',
  description: 'Browse live streams by category, follow your favorite creators, and watch instantly. Gaming, coding, music, podcasts, and more.',
  keywords: 'live streaming, watch live, browse streams, gaming streams, coding streams, free live streaming',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'StreamVault' },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
    other: [{ rel: 'icon', url: '/icon.png', sizes: '32x32', type: 'image/png' }],
  },
  openGraph: {
    title: 'StreamVault — Discover Live Streams',
    description: 'Browse live streams by category, follow creators, and watch instantly.',
    url: 'https://my-stream-vibes-client.vercel.app/',
    siteName: 'StreamVault',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StreamVault — Discover Live Streams',
    description: 'Browse live streams by category, follow creators, and watch instantly.',
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: { canonical: 'https://my-stream-vibes-client.vercel.app/' },
};

export const viewport = {
  themeColor: '#ef4444',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ServiceWorkerRegister />
        <SessionProvider>
          <ThemeProvider>
            <I18nProvider>
              <NotificationSocketProvider>
                {children}
                <NotificationToastHost />
              </NotificationSocketProvider>
            </I18nProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
