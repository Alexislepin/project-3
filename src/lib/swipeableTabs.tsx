import React, { useState, useRef, useEffect } from 'react';

interface SwipeableTabsProps {
  tabs: Array<{ id: string; label: string }>;
  currentTab: string;
  onTabChange: (tabId: string) => void;
  children: React.ReactNode[];
}

/**
 * Composant pour swipe horizontal entre onglets
 * Détecte les gestes horizontaux (deltaX > deltaY) et change d'onglet
 * Le scroll vertical reste intact
 */
export function SwipeableTabs({ tabs, currentTab, onTabChange, children }: SwipeableTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentIndex = tabs.findIndex(t => t.id === currentTab);

  useEffect(() => {
    if (containerRef.current && currentIndex !== -1) {
      const targetScroll = containerRef.current.children[currentIndex] as HTMLElement;
      if (targetScroll) {
        containerRef.current.scrollTo({
          left: targetScroll.offsetLeft,
          behavior: 'smooth',
        });
      }
    }
  }, [currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || !containerRef.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = Math.abs(currentX - startX.current);
    const deltaY = Math.abs(currentY - startY.current);

    // Si le geste est plus vertical que horizontal, laisser le scroll vertical fonctionner
    if (deltaY > deltaX) {
      setIsSwiping(false);
      return;
    }

    // Si le geste est horizontal, empêcher le scroll vertical
    if (deltaX > 10) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSwiping) return;

    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startX.current;
    const threshold = 50; // Minimum swipe distance

    if (Math.abs(deltaX) > threshold) {
      if (deltaX > 0 && currentIndex > 0) {
        // Swipe right -> previous tab
        onTabChange(tabs[currentIndex - 1].id);
      } else if (deltaX < 0 && currentIndex < tabs.length - 1) {
        // Swipe left -> next tab
        onTabChange(tabs[currentIndex + 1].id);
      }
    }

    setIsSwiping(false);
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="flex overflow-x-hidden snap-x snap-mandatory scrollbar-hide"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ scrollBehavior: 'smooth' }}
      >
        {React.Children.map(children, (child, index) => (
          <div
            key={tabs[index]?.id || index}
            className="w-full flex-shrink-0 snap-center"
            style={{ minWidth: '100%' }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
