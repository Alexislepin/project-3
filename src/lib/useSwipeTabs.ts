import { useRef, useState, useEffect } from 'react';

interface UseSwipeTabsOptions {
  tabs: string[];
  currentTab: string;
  onTabChange: (tab: string) => void;
  threshold?: number; // Minimum horizontal swipe distance (default: 60)
  verticalThreshold?: number; // Ratio to prevent vertical scroll interference (default: 2.2)
  containerRef?: React.RefObject<HTMLElement>; // Container element for swipe detection
  ignoreAboveY?: number; // Ignore swipes that start above this Y coordinate (header height)
}

/**
 * Hook pour détecter les swipes horizontaux entre tabs
 * Ne bloque pas le scroll vertical
 * 
 * @param containerRef - Element container pour la détection (si non fourni, utilise document.body)
 * @param ignoreAboveY - Ignorer les swipes qui démarrent au-dessus de cette coordonnée Y (pour ignorer header)
 */
export function useSwipeTabs({
  tabs,
  currentTab,
  onTabChange,
  threshold = 60, // Plus strict: 60px minimum
  verticalThreshold = 2.2, // Plus strict: ratio dx/dy > 2.2
  containerRef: externalContainerRef,
  ignoreAboveY,
}: UseSwipeTabsOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const isSwiping = useRef(false);
  const internalContainerRef = useRef<HTMLElement | null>(null);
  const containerRef = externalContainerRef || internalContainerRef;

  useEffect(() => {
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex === -1) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      
      const startYPos = e.touches[0].clientY;
      
      // Ignorer si le swipe démarre dans le header
      if (ignoreAboveY !== undefined && startYPos < ignoreAboveY) {
        return;
      }
      
      startX.current = e.touches[0].clientX;
      startY.current = startYPos;
      isSwiping.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwiping.current && e.touches.length === 1) {
        const deltaX = Math.abs(e.touches[0].clientX - startX.current);
        const deltaY = Math.abs(e.touches[0].clientY - startY.current);

        // Détecter si c'est un geste horizontal clair (plus strict)
        // dx > 60 ET abs(dy) < 25 ET ratio dx/dy > 2.2
        if (deltaX > threshold && deltaY < 25 && deltaX > deltaY * verticalThreshold) {
          isSwiping.current = true;
          // Empêcher le scroll vertical pendant le swipe horizontal
          if (e.cancelable) {
            e.preventDefault();
          }
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

    const element = containerRef?.current || document.body;
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [tabs, currentTab, onTabChange, threshold, verticalThreshold, containerRef, ignoreAboveY]);

  return { containerRef: internalContainerRef };
}

