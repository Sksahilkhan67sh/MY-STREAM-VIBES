import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import IntroWrapper from '@/components/IntroWrapper';

const inter = Inter({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'StreamVault — Private Live Streaming',
  description: 'Private live streaming. No signup. Instant links. End-to-end encrypted.',
  icons: { icon: '/favicon.ico' },
};


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <IntroWrapper>
          {children}
        </IntroWrapper>
      </body>
    </html>
  );
}

