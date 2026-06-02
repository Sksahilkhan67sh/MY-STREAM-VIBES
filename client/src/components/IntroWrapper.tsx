'use client';
import { useState, useEffect } from 'react';
import IntroAnimation from './IntroAnimation';

interface IntroWrapperProps {
  children: React.ReactNode;
}

export default function IntroWrapper({ children }: IntroWrapperProps) {
  // Show intro on EVERY page load — no localStorage gate
  // Use a "mounted" flag to avoid SSR hydration mismatch
  const [mounted,   setMounted]   = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleComplete = () => {
    setShowIntro(false);
  };

  // During SSR / before mount: render nothing so there's no hydration mismatch
  if (!mounted) return null;

  return (
    <>
      {showIntro && <IntroAnimation onComplete={handleComplete} />}
      {/* Page content rendered underneath — visible only after intro exits */}
      <div style={{ visibility: showIntro ? 'hidden' : 'visible' }}>
        {children}
      </div>
    </>
  );
}
