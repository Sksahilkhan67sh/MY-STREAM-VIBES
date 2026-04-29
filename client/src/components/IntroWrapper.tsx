'use client';
import { useState, useEffect } from 'react';
import IntroAnimation from './IntroAnimation';

interface IntroWrapperProps {
  children: React.ReactNode;
}

export default function IntroWrapper({ children }: IntroWrapperProps) {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    // Show intro only once per session
    const seen = sessionStorage.getItem('sv-intro-seen');
    if (!seen) setShowIntro(true);
  }, []);

  const handleComplete = () => {
    sessionStorage.setItem('sv-intro-seen', '1');
    setShowIntro(false);
  };

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
