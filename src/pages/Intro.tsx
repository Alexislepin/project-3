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
      className={`fixed inset-0 bg-black flex flex-col items-center justify-center z-[9999] transition-opacity duration-200 ${
        fadeIn ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Logo */}
      <div className="mb-8">
        <BrandLogo size={64} color="#fff" />
      </div>

      {/* Tagline */}
      <p className="text-white/80 text-lg font-medium mb-12 text-center px-8">
        Votre compagnon de lecture
      </p>

      {/* Start Button */}
      <button
        onClick={handleStart}
        className="px-8 py-4 bg-primary text-black font-bold rounded-full hover:brightness-95 active:scale-95 transition-all"
      >
        Commencer
      </button>
    </div>
  );
}

