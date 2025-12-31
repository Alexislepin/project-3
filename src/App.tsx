import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/Login';
import { SignupPage } from './pages/Signup';
import { ResetPasswordPage } from './pages/ResetPassword';
import { ProfileOnboarding } from './pages/ProfileOnboarding';
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
import { Intro } from './pages/Intro';
import { initSwipeBack } from './lib/swipeBack';
import { debugLog, debugError } from './utils/logger';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type AppView = 'home' | 'profile' | 'library' | 'insights' | 'search' | 'debug' | 'social';

// Safe timer management to prevent double-invoke issues with React StrictMode
const endedTimers = new Set<string>();

function safeTimeEnd(name: string) {
  if (endedTimers.has(name)) return;
  try { 
    console.timeEnd(name); 
  } catch (e) {
    // Timer doesn't exist, ignore
  }
  endedTimers.add(name);
}

function App() {
  // ============================================
  // TOUS LES HOOKS AU TOP-LEVEL (même ordre toujours)
  // Aucun hook ne doit être dans un if/switch/return early
  // ============================================
  
  // Instrumentation: Mesurer le premier render
  useEffect(() => {
    if (!(window as any).__firstRenderStarted) {
      (window as any).__firstRenderStarted = true;
      console.time('FIRST_RENDER');
    }
    console.log('[APP] First render completed');
    // Use safeTimeEnd to prevent double-invoke issues
    setTimeout(() => safeTimeEnd('FIRST_RENDER'), 0);
  }, []);

  useEffect(() => {
    console.log('✅ JS LOG TEST: App mounted');
  }, []);
  
  // Hook 1: Auth context
  const { user, loading, profile, profileLoading, profileResolved, isOnboardingComplete } = useAuth();
  
  // Hook 2-8: State hooks (toujours dans le même ordre)
  const [hasSeenIntro, setHasSeenIntro] = useState<boolean | null>(null); // null = checking
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [needsLanguageOnboarding, setNeedsLanguageOnboarding] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [showActiveSession, setShowActiveSession] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false); // FIX: Start false, set true only when needed
  const [refreshKey, setRefreshKey] = useState(0);

  // Hook 7: Check intro status (first check, before everything)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('lexu_seen_intro') === 'true';
      setHasSeenIntro(seen);
    } else {
      setHasSeenIntro(true); // Default to true on server
    }
  }, []);

  // Hook 8: Check language onboarding (first check)
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

  // Hook 9: Check onboarding status (NON-BLOQUANT)
  useEffect(() => {
    // Condition dans le body du hook (OK), pas autour du hook (interdit)
    if (user && !needsLanguageOnboarding && !profileLoading) {
      // Check profile onboarding completion
      if (profile && !isOnboardingComplete) {
        setNeedsOnboarding(true);
      } else if (profile && isOnboardingComplete) {
        // Also check interests onboarding (legacy)
        setCheckingOnboarding(true);
        const checkInterestsOnboarding = async () => {
          try {
            const { data: profileData } = await supabase
              .from('user_profiles')
              .select('interests')
              .eq('id', user.id)
              .maybeSingle();

            if (profileData && profileData.interests && profileData.interests.length > 0) {
              setNeedsOnboarding(false);
            } else {
              // Profile onboarding complete but interests not set - show interests onboarding
              setNeedsOnboarding(true);
            }
          } catch (error) {
            console.error('[APP] Error checking interests onboarding:', error);
            setNeedsOnboarding(false);
          } finally {
            setCheckingOnboarding(false);
          }
        };
        checkInterestsOnboarding();
      }
    } else if (!user) {
      setNeedsOnboarding(false);
      setCheckingOnboarding(false);
    }
  }, [user, needsLanguageOnboarding, profile, profileLoading, isOnboardingComplete]);

  // Hook 10: Routing basé sur l'URL
  useEffect(() => {
    const updateViewFromPath = () => {
      const path = window.location.pathname;
      if (path === '/login' || path === '/signup') {
        // Les pages auth sont gérées séparément
        return;
      }
      // Map paths to AppView
      const viewFromPath = path.substring(1) as AppView; // Remove leading '/'
      if (['home', 'profile', 'library', 'insights', 'search', 'debug', 'social'].includes(viewFromPath)) {
        setCurrentView(viewFromPath);
      } else if (path === '/') {
        setCurrentView('home');
      }
    };

    // Initial load
    updateViewFromPath();

    // Listen for popstate events (back/forward navigation and programmatic navigation)
    window.addEventListener('popstate', updateViewFromPath);
    
    return () => {
      window.removeEventListener('popstate', updateViewFromPath);
    };
  }, []);

  // Hook 11: Initialize iOS swipe back gesture
  useEffect(() => {
    initSwipeBack();
  }, []);

  // Hook 12: Deep link handling for password reset
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      // WEB: handled by ResetPasswordPage via getSessionFromUrl
      return;
    }

    // NATIVE (iOS/Android): handle deep links
    let removeListener: (() => void) | null = null;

    (async () => {
      const handleResetPasswordUrl = async (url: string) => {
        if (!url) return;
        // Check if URL contains reset-password (could be lexu://reset-password#...)
        if (!url.includes('reset-password') || !url.startsWith('lexu://')) return;

        try {
          console.log('[APP] Handling reset password deep link:', url);
          
          // IMPORTANT: supabase expects full URL with tokens/hash/query
          // Convert lexu:// to https:// for getSessionFromUrl
          const httpsUrl = url.replace('lexu://', 'https://dummy/');
          const { data, error } = await supabase.auth.getSessionFromUrl({ 
            storeSession: true, 
            url: httpsUrl 
          });

          if (error || !data.session) {
            console.error('[APP] Error getting session from URL:', error);
            window.location.href = '/login';
            return;
          }

          console.log('[APP] Session established, navigating to reset-password');
          
          // Navigate to reset password page (SPA navigation)
          window.history.replaceState({}, '', '/reset-password');
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (e) {
          console.error('[APP] Deep link error:', e);
          window.location.href = '/login';
        }
      };

      // ✅ Cold start
      const launch = await CapApp.getLaunchUrl();
      if (launch?.url) {
        await handleResetPasswordUrl(launch.url);
      }

      // ✅ App déjà ouverte
      const l = await CapApp.addListener('appUrlOpen', async ({ url }) => {
        if (!url) return;
        await handleResetPasswordUrl(url);
      });

      removeListener = () => l.remove();
    })();

    return () => {
      if (removeListener) removeListener();
    };
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

  const handleIntroDone = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('lexu_seen_intro', 'true');
    }
    setHasSeenIntro(true);
  };

  // ============================================
  // RENDER CONDITIONNEL (après tous les hooks)
  // ============================================
  
  // Early return: Intro (before everything)
  if (hasSeenIntro === false) {
    return <Intro onDone={handleIntroDone} />;
  }

  // Early return: Loading intro check
  if (hasSeenIntro === null) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-lg">Chargement...</div>
      </div>
    );
  }
  
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

  // Show loader while profile is loading (but only if we have a user)
  if (user && profileLoading && !profile) {
    return (
      <div className="min-h-screen bg-background-light flex items-center justify-center">
        <div className="text-text-sub-light">Chargement du profil...</div>
      </div>
    );
  }

  // Public routes (accessible without auth)
  const path = window.location.pathname;
  
  // Reset password page (public route, ResetPasswordPage handles session validation)
  if (path === '/reset-password') {
    return <ResetPasswordPage />;
  }

  // Pages auth accessibles sans protection
  if (!user) {
    if (path === '/signup') {
      return <SignupPage />;
    }
    return <LoginPage />;
  }

  // Language onboarding (first priority)
  if (needsLanguageOnboarding) {
    return <LanguageOnboarding onComplete={handleLanguageOnboardingComplete} />;
  }

  // Profile onboarding (username, display_name, bio, avatar) - NEW
  // CRITICAL: Never show Home if onboarding is not complete
  // IMPORTANT: Wait for profileResolved to avoid premature redirects
  if (user && profile && profileResolved && !isOnboardingComplete) {
    debugLog('[APP] Gating onboarding:', {
      userId: user.id,
      profileResolved,
      onboarding_completed: profile.onboarding_completed,
    });
    return <ProfileOnboarding />;
  }
  
  // Don't show onboarding if profile is not resolved yet (avoid flash/redirect)
  if (user && !profileResolved && profileLoading) {
    return (
      <div className="min-h-screen bg-background-light flex items-center justify-center">
        <div className="text-text-sub-light">Chargement du profil...</div>
      </div>
    );
  }

  // If user exists but profile is missing, try to refresh and show loading
  if (user && !profile && !profileLoading) {
    // This should not happen if refreshProfile works correctly, but as a safety net:
    return (
      <div className="min-h-screen bg-background-light flex items-center justify-center">
        <div className="text-text-sub-light">Initialisation du profil...</div>
      </div>
    );
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

  // Interests onboarding (legacy - only if profile onboarding is complete)
  if (needsOnboarding && isOnboardingComplete) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // Route dédiée pour la gestion d'un livre : /library/manage/:bookId
  const routePath = window.location.pathname;
  const manageMatch = routePath.match(/^\/library\/manage\/([^/]+)$/);
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
            currentView={currentView as 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social'}
            onNavigate={handleNavigate as (view: 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social') => void}
            onStartSession={() => setShowActiveSession(true)}
          >
            {currentView === 'home' && <Home key={`home-${refreshKey}`} />}
            {currentView === 'profile' && <Profile key={`profile-${refreshKey}`} onNavigateToLibrary={() => handleNavigate('library')} />}
            {currentView === 'library' && <Library key={`library-${refreshKey}`} onNavigateToSearch={() => handleNavigate('search')} />}
            {currentView === 'insights' && <Insights key={`insights-${refreshKey}`} />}
          </AppLayout>

          {/* Search page (not in pager, overlay) */}
          {currentView === 'search' && (
            <div className="fixed inset-0 bg-background-light z-[200] overflow-y-auto">
              <Search key={`search-${refreshKey}`} />
            </div>
          )}

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
