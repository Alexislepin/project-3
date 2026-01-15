import { useEffect } from 'react';

/**
 * SplashScreen React interne
 * Masque le launch screen iOS dès que React est monté
 * Ne dépend PAS du chargement des données
 */
export function SplashScreen({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Simple log pour iOS; plus de délai ni d'écran intermédiaire
    console.log('[SPLASH] React mounted, skipping splash fallback');
  }, []);

  // Afficher directement l'app, sans écran blanc intermédiaire
  return <>{children}</>;
}

