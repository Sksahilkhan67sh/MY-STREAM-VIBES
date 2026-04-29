import type { Metadata } from 'next';
import './globals.css';
import IntroWrapper from '@/components/IntroWrapper';

export const metadata: Metadata = {
  title: 'StreamVault — Private Live Streaming',
  description: 'Stream privately. Share instantly. No account required.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
