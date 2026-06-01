'use client';
import { useState, useEffect } from 'react';
import IntroAnimation from './IntroAnimation';

interface IntroWrapperProps {
  children: React.ReactNode;
}

// Bump this key version whenever you want all users to see the intro again
const INTRO_KEY = 'sv-intro-seen-v2';

export default function IntroWrapper({ children }: IntroWrapperProps) {
  const [showIntro, setShowIntro] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Show intro only once per key version
    const seen = localStorage.getItem(INTRO_KEY);
    if (!seen) setShowIntro(true);
    setChecked(true);
  }, []);

  const handleComplete = () => {
    localStorage.setItem(INTRO_KEY, '1');
    setShowIntro(false);
  };

  // Don't render anything until we've checked localStorage (avoids SSR flash)
  if (!checked) return null;

  return (
    <>
      {showIntro && <IntroAnimation onComplete={handleComplete} />}
      {/* Render children underneath so the page is ready when intro exits */}
      <div style={{ visibility: showIntro ? 'hidden' : 'visible' }}>
        {children}
      </div>
    </>
  );
}
