import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;
let prevOverflow = '';
let prevPosition = '';
let prevTop = '';
let prevWidth = '';

/**
 * Hook pour verrouiller/déverrouiller le scroll du body
 * Utile pour empêcher le scroll de la page derrière une modal
 * Utilise un compteur global pour gérer plusieurs modals ouverts simultanément
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    lockCount += 1;
    if (lockCount === 1) {
      const body = document.body;

      savedScrollY = window.scrollY || window.pageYOffset || 0;

      prevOverflow = body.style.overflow;
      prevPosition = body.style.position;
      prevTop = body.style.top;
      prevWidth = body.style.width;

      // iOS + web: lock background scroll
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${savedScrollY}px`;
      body.style.width = '100%';
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        const body = document.body;

        body.style.overflow = prevOverflow;
        body.style.position = prevPosition;
        body.style.top = prevTop;
        body.style.width = prevWidth;

        window.scrollTo(0, savedScrollY);
      }
    };
  }, [locked]);
}

