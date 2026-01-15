import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { celebrateStart } from '../lib/celebrate';

interface IntroProps {
  onDone: () => void;
}

export function Intro({ onDone }: IntroProps) {
  const [fadeIn, setFadeIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Trigger fade-in animation
    setTimeout(() => setFadeIn(true), 50);
  }, []);

  const handleStart = async () => {
    // Celebration: haptic + confetti
    await celebrateStart();

    // Petite pause pour que l'utilisateur voie l'effet (un poil plus long = sûr de voir l'effet)
    setTimeout(() => {
      setFadeIn(false);
      setTimeout(() => {
        onDone();
        navigate('/home');
      }, 200);
    }, 550);
  };

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center justify-center z-[9999] transition-opacity duration-200 bg-[rgb(0,0,0)] ${
        fadeIn ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="w-full max-w-[420px] px-8 text-center space-y-8">
        {/* Title */}
        <h1 className="font-extrabold tracking-tight text-[rgb(255,255,255)] text-[clamp(48px,18vw,92px)] leading-none">
          LEXU.
        </h1>

        {/* Tagline */}
        <p className="text-[rgba(255,255,255,0.75)] text-lg font-medium !mt-0">
          Votre compagnon de lecture
        </p>

        {/* Start Button */}
        <button
          onClick={handleStart}
          className="w-full py-4 bg-primary text-[rgb(0,0,0)] font-bold rounded-full shadow-[0_8px_28px_rgba(249,245,6,0.3)] hover:brightness-95 active:scale-95 transition-all"
        >
          Commencer
        </button>
      </div>
    </div>
  );
}

