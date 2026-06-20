'use client';
// /host/ppv/[roomId] → /studio (backward-compatible redirect)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HostPPVRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio');
  }, [router]);
  return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-[#ff3520] animate-spin" />
    </div>
  );
}
