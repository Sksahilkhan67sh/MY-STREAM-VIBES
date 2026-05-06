import { Suspense } from 'react';
import CoHostPageClient from './CoHostPageClient';

export default function CoHostPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center"
        style={{ fontFamily: "'DM Sans','Inter',sans-serif" }}>
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          Loading co-host studio...
        </div>
      </div>
    }>
      <CoHostPageClient />
    </Suspense>
  );
}
