/**
 * iOS Edge Swipe Back Gesture
 * Detects swipe from left edge (>60px) and triggers window.history.back()
 * Only activates on secondary pages (not root pages like /home)
 */

let touchStartX = 0;
let touchStartY = 0;
let isSwipeActive = false;
const EDGE_THRESHOLD = 20; // pixels from left edge
const SWIPE_THRESHOLD = 60; // minimum swipe distance
const MAX_VERTICAL_DRIFT = 50; // max vertical movement allowed

export function initSwipeBack() {
  // Only enable on iOS/Capacitor
  if (typeof window === 'undefined') return;
  
  // Check if we're on a native platform
  const isNative = /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                   (window as any).Capacitor?.isNativePlatform();

  if (!isNative) return;

  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  document.addEventListener('touchmove', handleTouchMove, { passive: true });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
}

function handleTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  
  // Only activate if touch starts near left edge
  if (touchStartX <= EDGE_THRESHOLD) {
    isSwipeActive = true;
  } else {
    isSwipeActive = false;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (!isSwipeActive) return;

  const touch = e.touches[0];
  if (!touch) return;

  const deltaX = touch.clientX - touchStartX;
  const deltaY = Math.abs(touch.clientY - touchStartY);

  // Cancel if vertical movement is too large (user is scrolling vertically)
  if (deltaY > MAX_VERTICAL_DRIFT) {
    isSwipeActive = false;
    return;
  }

  // Cancel if swipe goes left (not right)
  if (deltaX < 0) {
    isSwipeActive = false;
    return;
  }
}

function handleTouchEnd(e: TouchEvent) {
  if (!isSwipeActive) return;

  const touch = e.changedTouches[0];
  if (!touch) return;

  const deltaX = touch.clientX - touchStartX;
  const deltaY = Math.abs(touch.clientY - touchStartY);

  // Check if swipe is valid (right direction, sufficient distance, not too vertical)
  if (deltaX >= SWIPE_THRESHOLD && deltaY <= MAX_VERTICAL_DRIFT) {
    // Check if we're not on a root page (allow back navigation)
    const path = window.location.pathname;
    const rootPaths = ['/', '/home', '/library', '/profile', '/insights', '/search'];
    const isRootPath = rootPaths.includes(path);

    // Exclure Home/Feed des swipe back (pour éviter conflit avec swipe tabs)
    if (path === '/' || path === '/home') {
      return;
    }

    // Vérifier aussi si on est sur une page secondaire (modal/profile view)
    // En vérifiant si un élément avec classe "fixed inset-0" ou "UserProfileView" est visible
    const hasModalOpen = document.querySelector('.fixed.inset-0.z-\\[200\\]') !== null ||
                         document.querySelector('[data-profile-view]') !== null;

    // Limiter swipe back à la zone gauche 25% de l'écran (comme iOS)
    const screenWidth = window.innerWidth;
    const leftZoneWidth = screenWidth * 0.25;
    const isInLeftZone = touchStartX <= leftZoneWidth;

    if ((!isRootPath || hasModalOpen) && isInLeftZone && window.history.length > 1) {
      window.history.back();
    }
  }

  isSwipeActive = false;
}

