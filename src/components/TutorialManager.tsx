import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { TutorialOverlay } from './TutorialOverlay';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  route: string; // Route where this step should be shown
  highlightSelector?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'center' | 'custom';
  customPosition?: { top?: number; left?: number; right?: number; bottom?: number };
  waitForElement?: boolean; // Wait for element to exist before showing
}

// Tutorial steps definition
const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenue sur Lexu ! 📚',
    description: 'Lexu t\'aide à suivre ta lecture, découvrir de nouveaux livres et partager tes découvertes avec d\'autres lecteurs.',
    route: '/home',
    position: 'center',
  },
  {
    id: 'home_feed',
    title: 'Ton fil d\'activités',
    description: 'Ici, tu verras les activités de lecture des personnes que tu suis. Commence par suivre quelques lecteurs pour remplir ton fil !',
    route: '/home',
    highlightSelector: '[data-tutorial="activities-feed"]',
    position: 'top',
  },
  {
    id: 'library_tab',
    title: 'Ta bibliothèque',
    description: 'L\'onglet Bibliothèque te permet de gérer tes livres : ceux que tu lis, ceux que tu as terminés, et ceux que tu veux lire.',
    route: '/library',
    highlightSelector: '[data-tutorial="library-tab"]',
    position: 'bottom',
  },
  {
    id: 'add_book',
    title: 'Ajouter un livre',
    description: 'Clique sur "Explorer" pour découvrir de nouveaux livres, ou utilise le scanner pour ajouter un livre par son code-barres.',
    route: '/library',
    highlightSelector: '[data-tutorial="add-book"]',
    position: 'top',
  },
  {
    id: 'start_reading',
    title: 'Commencer une session',
    description: 'Une fois qu\'un livre est dans ta bibliothèque, tu peux lancer une session de lecture depuis l\'onglet "En cours".',
    route: '/library',
    highlightSelector: '[data-tutorial="start-session"]',
    position: 'top',
  },
  {
    id: 'insights',
    title: 'Tes statistiques',
    description: 'L\'onglet Statistiques te montre tes progrès : pages lues, temps passé, séries de jours consécutifs, et bien plus.',
    route: '/insights',
    highlightSelector: '[data-tutorial="insights-tab"]',
    position: 'bottom',
  },
  {
    id: 'social',
    title: 'Le feed social',
    description: 'Découvre ce que lisent les autres utilisateurs, aime leurs livres et commente leurs activités. C\'est ici que la communauté se retrouve !',
    route: '/social',
    highlightSelector: '[data-tutorial="social-tab"]',
    position: 'bottom',
  },
  {
    id: 'profile',
    title: 'Ton profil',
    description: 'L\'onglet Profil te permet de voir tes stats, gérer tes objectifs, et découvrir d\'autres lecteurs à suivre.',
    route: '/profile',
    highlightSelector: '[data-tutorial="profile-tab"]',
    position: 'bottom',
  },
  {
    id: 'complete',
    title: 'C\'est parti ! 🎉',
    description: 'Tu es maintenant prêt à utiliser Lexu. N\'hésite pas à explorer toutes les fonctionnalités et à suivre d\'autres lecteurs !',
    route: '/home',
    position: 'center',
  },
];

interface TutorialManagerProps {
  onComplete: () => void;
}

export function TutorialManager({ onComplete }: TutorialManagerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  const currentStep = TUTORIAL_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === TUTORIAL_STEPS.length - 1;

  // Navigate to step's route if needed
  useEffect(() => {
    if (!currentStep) return;

    const currentPath = location.pathname;
    const targetRoute = currentStep.route;

    // If we're not on the correct route, navigate
    if (currentPath !== targetRoute && !isNavigating) {
      setIsNavigating(true);
      // Use window.location for reliable navigation
      window.location.href = targetRoute;
    } else if (currentPath === targetRoute && isNavigating) {
      // Wait a bit for page to render
      setTimeout(() => {
        setIsNavigating(false);
      }, 300);
    }
  }, [currentStep, location.pathname, isNavigating]);

  const handleNext = async () => {
    if (isLastStep) {
      // Mark tutorial as complete
      if (user) {
        await supabase
          .from('user_profiles')
          .update({ has_completed_tutorial: true })
          .eq('id', user.id);
      }
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleSkip = async () => {
    // Mark tutorial as complete
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ has_completed_tutorial: true })
        .eq('id', user.id);
    }
    onComplete();
  };

  // Don't render if navigating
  if (isNavigating || !currentStep) {
    return null;
  }

  // Only show if we're on the correct route
  if (location.pathname !== currentStep.route) {
    return null;
  }

  return (
    <TutorialOverlay
      step={currentStepIndex + 1}
      totalSteps={TUTORIAL_STEPS.length}
      title={currentStep.title}
      description={currentStep.description}
      onNext={handleNext}
      onSkip={handleSkip}
      highlightSelector={currentStep.highlightSelector}
      position={currentStep.position}
      customPosition={currentStep.customPosition}
    />
  );
}

