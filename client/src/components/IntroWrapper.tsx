'use client';
import { useState, useEffect } from 'react';
import IntroAnimation from './IntroAnimation';

interface IntroWrapperProps {
  children: React.ReactNode;
}

// Bump this key version whenever you want all users to see the intro again
const INTRO_KEY = 'sv-intro-seen-v3';

export default function IntroWrapper({ children }: IntroWrapperProps) {
  // Start as true so the intro shows immediately on first render (no flicker)
  // We'll hide it after checking localStorage if already seen
  const [showIntro, setShowIntro] = useState(true);
  const [checked,   setChecked]   = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(INTRO_KEY);
    if (seen) {
      // Already seen — skip animation immediately
      setShowIntro(false);
    }
    // else: leave showIntro=true so animation plays
    setChecked(true);
  }, []);

  const handleComplete = () => {
    localStorage.setItem(INTRO_KEY, '1');
    setShowIntro(false);
  };

  // While we haven't checked localStorage yet, show the intro overlay
  // (this avoids the blank flash and also means first-timers see it instantly)
  if (!checked) {
    return <IntroAnimation onComplete={handleComplete} />;
  }

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
