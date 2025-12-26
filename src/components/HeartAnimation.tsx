import { Heart } from 'lucide-react';
import { useState, useEffect } from 'react';

interface HeartAnimationProps {
  show: boolean;
  onComplete?: () => void;
}

/**
 * Animation de cœur qui apparaît au centre d'une cover lors d'un double-tap like
 */
export function HeartAnimation({ show, onComplete }: HeartAnimationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 300); // Animation dure 300ms
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <div className="text-red-500">
        <Heart className="w-16 h-16 fill-current drop-shadow-lg animate-[heartPop_300ms_ease-out]" />
      </div>
      <style>{`
        @keyframes heartPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}

