import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/Login';
import { SignupPage } from './pages/Signup';
import { Onboarding } from './components/auth/Onboarding';
import { LanguageOnboarding } from './components/auth/LanguageOnboarding';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Library } from './pages/Library';
import { Insights } from './pages/Insights';
import { ActiveSession } from './pages/ActiveSession';
import { Search } from './pages/Search';
import { Debug } from './pages/Debug';
import { ManageBook } from './pages/ManageBook';
import { initSwipeBack } from './lib/swipeBack';

type AppView = 'home' | 'profile' | 'library' | 'insights' | 'search' | 'debug';

function App() {
  // ============================================
  // TOUS LES HOOKS AU TOP-LEVEL (même ordre toujours)
  // Aucun hook ne doit être dans un if/switch/return early
  // ============================================
  
  // Instrumentation: Mesurer le premier render
  useEffect(() => {
    console.time('FIRST_RENDER');
    console.log('[APP] First render completed');
    console.timeEnd('FIRST_RENDER');
  }, []);
  
  // Hook 1: Auth context
  const { user, loading } = useAuth();
  
  // Hook 2-7: State hooks (toujours dans le même ordre)
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsLanguageOnboarding, setNeedsLanguageOnboarding] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [showActiveSession, setShowActiveSession] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false); // FIX: Start false, set true only when needed
  const [refreshKey, setRefreshKey] = useState(0);

  // Hook 7: Check language onboarding (first check)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedLang = localStorage.getItem('lexu_lang');
      if (!storedLang || (storedLang !== 'fr' && storedLang !== 'en')) {
        setNeedsLanguageOnboarding(true);
      } else {
        setNeedsLanguageOnboarding(false);
      }
    }
  }, []);

  // Hook 8: Check onboarding status (NON-BLOQUANT)
  useEffect(() => {
    // Condition dans le body du hook (OK), pas autour du hook (interdit)
    if (user && !needsLanguageOnboarding) {
      // FIX: Ne pas bloquer le render - vérifier onboarding en arrière-plan
      setCheckingOnboarding(true);
      const checkOnboardingStatus = async () => {
        console.time('LOAD_INITIAL_DATA');
        console.log('[APP] Checking onboarding status...');
        
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('interests')
            .eq('id', user.id)
            .maybeSingle();

          if (profile && profile.interests && profile.interests.length > 0) {
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
          }
        } catch (error) {
          console.error('[APP] Error checking onboarding:', error);
          // Default to no onboarding on error
          setNeedsOnboarding(false);
        } finally {
          setCheckingOnboarding(false);
          console.timeEnd('LOAD_INITIAL_DATA');
        }
      };

      checkOnboardingStatus();
    } else {
      setCheckingOnboarding(false);
    }
  }, [user, needsLanguageOnboarding]);

  // Hook 9: Routing basé sur l'URL
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/login' || path === '/signup') {
      // Les pages auth sont gérées séparément
      return;
    }
    // Map paths to AppView
    const viewFromPath = path.substring(1) as AppView; // Remove leading '/'
    if (['home', 'profile', 'library', 'insights', 'search', 'debug'].includes(viewFromPath)) {
      setCurrentView(viewFromPath);
    } else if (path === '/') {
      setCurrentView('home');
    }
  }, []);

  // Hook 10: Initialize iOS swipe back gesture
  useEffect(() => {
    initSwipeBack();
  }, []);

  // ============================================
  // HANDLERS (pas de hooks ici)
  // ============================================
  const handleLanguageOnboardingComplete = () => {
    setNeedsLanguageOnboarding(false);
  };

  const handleOnboardingComplete = () => {
    setNeedsOnboarding(false);
  };

  const handleSessionFinish = () => {
    setShowActiveSession(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleNavigate = (view: AppView) => {
    setCurrentView(view);
    setRefreshKey(prev => prev + 1);
  };

  // ============================================
  // RENDER CONDITIONNEL (après tous les hooks)
  // ============================================
  
  // FIX: Afficher l'UI immédiatement avec un loader, ne pas bloquer complètement
  // Le loader s'affiche pendant que l'auth charge, mais l'UI est déjà montée
  
  // Si on est en train de charger ET qu'on n'a pas encore de user, afficher le loader
  // Sinon, afficher l'UI même si checkingOnboarding est true (non-bloquant)
  if (loading && !user) {
    return (
      <div className="min-h-screen bg-background-light flex items-center justify-center">
        <div className="text-text-sub-light">Chargement...</div>
      </div>
    );
  }

  // Pages auth accessibles sans protection
  if (!user) {
    const path = window.location.pathname;
    if (path === '/signup') {
      return <SignupPage />;
    }
    return <LoginPage />;
  }

  // Language onboarding (first priority)
  if (needsLanguageOnboarding) {
    return <LanguageOnboarding onComplete={handleLanguageOnboardingComplete} />;
  }

  // FIX: Afficher l'UI même si onboarding check est en cours
  // On affichera l'onboarding une fois qu'on sait qu'il est nécessaire
  if (checkingOnboarding) {
    // Afficher un loader léger pendant la vérification (non-bloquant)
    return (
      <div className="min-h-screen bg-background-light">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-text-sub-light">Chargement...</div>
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // Route dédiée pour la gestion d'un livre : /library/manage/:bookId
  const path = window.location.pathname;
  const manageMatch = path.match(/^\/library\/manage\/([^/]+)$/);
  if (manageMatch) {
    const [, bookId] = manageMatch;
    return <ManageBook bookId={bookId} />;
  }

  // Debug page doesn't use AppLayout
  if (currentView === 'debug') {
    return <Debug />;
  }

  // Routes protégées
  return (
    <ErrorBoundary>
      <ProtectedRoute>
        <>
          <AppLayout
            currentView={currentView as 'home' | 'search' | 'library' | 'profile' | 'insights'}
            onNavigate={handleNavigate as (view: 'home' | 'search' | 'library' | 'profile' | 'insights') => void}
            onStartSession={() => setShowActiveSession(true)}
          >
            {currentView === 'home' && <Home key={`home-${refreshKey}`} />}
            {currentView === 'profile' && <Profile key={`profile-${refreshKey}`} onNavigateToLibrary={() => handleNavigate('library')} />}
            {currentView === 'library' && <Library key={`library-${refreshKey}`} onNavigateToSearch={() => handleNavigate('search')} />}
            {currentView === 'insights' && <Insights key={`insights-${refreshKey}`} />}
            {currentView === 'search' && <Search key={`search-${refreshKey}`} />}
          </AppLayout>

          {showActiveSession && (
            <ActiveSession
              onCancel={() => setShowActiveSession(false)}
              onFinish={handleSessionFinish}
            />
          )}
        </>
      </ProtectedRoute>
    </ErrorBoundary>
  );
}

export default App;
