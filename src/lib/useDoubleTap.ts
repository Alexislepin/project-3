import { useRef, useCallback } from 'react';

interface DoubleTapOptions {
  onDoubleTap: () => void;
  delay?: number; // Max delay between taps (default: 260ms)
  maxDistance?: number; // Max distance between taps in pixels (default: 20px)
}

/**
 * Hook pour détecter le double-tap (mobile) ou double-click (desktop)
 * 
 * Détection:
 * - Deux taps/clicks à < 260ms d'intervalle
 * - Distance entre les deux points < 20px
 * - Ne déclenche PAS sur un simple tap/click
 */
export function useDoubleTap({
  onDoubleTap,
  delay = 260,
  maxDistance = 20,
}: DoubleTapOptions) {
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // Get coordinates
      let x: number, y: number;
      if ('touches' in e) {
        // Touch event - use changedTouches or touches
        const touch = e.changedTouches?.[0] || e.touches?.[0];
        if (!touch) return;
        x = touch.clientX;
        y = touch.clientY;
      } else {
        // Mouse event
        x = e.clientX;
        y = e.clientY;
      }

      const now = Date.now();
      const lastTap = lastTapRef.current;

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (lastTap) {
        const timeDiff = now - lastTap.time;
        const distance = Math.sqrt(
          Math.pow(x - lastTap.x, 2) + Math.pow(y - lastTap.y, 2)
        );

        // Check if it's a double tap
        if (timeDiff < delay && distance < maxDistance) {
          // Double tap detected!
          e.preventDefault();
          e.stopPropagation();
          onDoubleTap();
          lastTapRef.current = null; // Reset
          return;
        }
      }

      // Store this tap for potential double tap
      lastTapRef.current = { time: now, x, y };

      // Clear after delay (single tap, not double)
      timeoutRef.current = setTimeout(() => {
        lastTapRef.current = null;
      }, delay);
    },
    [onDoubleTap, delay, maxDistance]
  );

  // Also handle double-click for desktop
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDoubleTap();
    },
    [onDoubleTap]
  );

  return {
    onTouchStart: handleTap,
    onMouseDown: handleTap,
    onDoubleClick: handleDoubleClick,
  };
}

