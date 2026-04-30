import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeContext';
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
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">
        <ThemeProvider>
          <IntroWrapper>
            {children}
          </IntroWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
