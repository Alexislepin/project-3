import { useRef, useState, useEffect } from 'react';

interface UseSwipeTabsOptions {
  tabs: string[];
  currentTab: string;
  onTabChange: (tab: string) => void;
  threshold?: number; // Minimum horizontal swipe distance (default: 35)
  verticalThreshold?: number; // Ratio to prevent vertical scroll interference (default: 1.2)
}

/**
 * Hook pour détecter les swipes horizontaux entre tabs
 * Ne bloque pas le scroll vertical
 */
export function useSwipeTabs({
  tabs,
  currentTab,
  onTabChange,
  threshold = 35,
  verticalThreshold = 1.2,
}: UseSwipeTabsOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const isSwiping = useRef(false);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex === -1) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isSwiping.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwiping.current && e.touches.length === 1) {
        const deltaX = Math.abs(e.touches[0].clientX - startX.current);
        const deltaY = Math.abs(e.touches[0].clientY - startY.current);

        // Détecter si c'est un geste horizontal clair
        if (deltaX > threshold && deltaX > deltaY * verticalThreshold) {
          isSwiping.current = true;
          // Empêcher le scroll vertical pendant le swipe horizontal
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isSwiping.current) return;

      const endX = e.changedTouches[0].clientX;
      const deltaX = endX - startX.current;

      if (Math.abs(deltaX) > threshold) {
        const currentIndex = tabs.indexOf(currentTab);
        if (deltaX > 0 && currentIndex > 0) {
          // Swipe right -> previous tab
          onTabChange(tabs[currentIndex - 1]);
        } else if (deltaX < 0 && currentIndex < tabs.length - 1) {
          // Swipe left -> next tab
          onTabChange(tabs[currentIndex + 1]);
        }
      }

      isSwiping.current = false;
    };

    const element = containerRef.current || document.body;
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [tabs, currentTab, onTabChange, threshold, verticalThreshold]);

  return { containerRef };
}

