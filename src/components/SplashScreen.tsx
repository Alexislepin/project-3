import { useEffect, useState } from 'react';

/**
 * SplashScreen React interne
 * Masque le launch screen iOS dès que React est monté
 * Ne dépend PAS du chargement des données
 */
export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Marquer comme prêt dès que React est monté (pas après chargement des données)
    // Cela masque le launch screen iOS immédiatement
    const timer = setTimeout(() => {
      setIsReady(true);
      console.log('[SPLASH] React mounted, hiding iOS launch screen');
    }, 50); // Très court délai pour s'assurer que React est bien monté

    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background-light flex items-center justify-center">
        <div className="text-text-sub-light">Chargement...</div>
      </div>
    );
  }

  return <>{children}</>;
}

