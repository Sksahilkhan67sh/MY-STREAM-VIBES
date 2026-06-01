// client/src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeContext';
import { SessionProvider } from 'next-auth/react';

export const metadata: Metadata = {
  title: 'StreamVault — Free Private Live Streaming, No Account Needed',
  description: 'Create a private live stream in seconds. Share a link instantly. No sign-up, no downloads. Stream to YouTube & Instagram simultaneously. Free forever.',
  keywords: 'free live streaming, private live stream, stream without account, stream share link, browser live stream',

  openGraph: {
    title: 'StreamVault — Free Private Live Streaming',
    description: 'Go live in one click. Share a link. No account needed.',
    url: 'https://my-stream-vibes-client.vercel.app/',
    siteName: 'StreamVault',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'StreamVault — Free Private Live Streaming',
    description: 'Go live in one click. Share a link. No account needed.',
    images: ['/og-image.png'],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },

  alternates: {
    canonical: 'https://my-stream-vibes-client.vercel.app/',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <SessionProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
