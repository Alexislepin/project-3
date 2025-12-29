let confettiFn: null | ((opts: any) => void) = null;

function getOrCreateConfettiCanvas() {
  let canvas = document.getElementById('lexu-confetti-canvas') as HTMLCanvasElement | null;

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'lexu-confetti-canvas';

    // FULLSCREEN + AU DESSUS DE TOUT
    Object.assign(canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '99999',
    });

    document.body.appendChild(canvas);
  }

  // sync taille réelle (important sur mobile)
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);

  return canvas;
}

async function ensureConfetti() {
  if (confettiFn) return confettiFn;

  const mod: any = await import('canvas-confetti');
  const confetti = mod.default || mod;

  const canvas = getOrCreateConfettiCanvas();
  const instance = confetti.create(canvas, { resize: true, useWorker: true });

  confettiFn = instance;
  return confettiFn;
}

/**
 * Light haptic feedback (vibration)
 * Works on mobile web and Capacitor native
 */
export function hapticLight() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([15, 30, 15]);
  }

  // Capacitor Haptics si natif
  try {
    // @ts-ignore
    const cap = (window as any)?.Capacitor;
    if (cap?.isNativePlatform?.()) {
      // @ts-ignore
      import('@capacitor/haptics')
        .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
        .catch(() => {});
    }
  } catch {}
}

/**
 * Full celebration: haptic + confetti
 * Call this when user completes an important action
 */
export async function celebrateStart() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  hapticLight();

  const confetti = await ensureConfetti();

  const base = {
    spread: 70,
    startVelocity: 45,
    ticks: 200,
    gravity: 0.95,
    scalar: 1.0,
    origin: { y: 0.65 },
  };

  confetti({ ...base, particleCount: 140, angle: 60, origin: { x: 0.2, y: 0.65 } });
  confetti({ ...base, particleCount: 140, angle: 120, origin: { x: 0.8, y: 0.65 } });

  setTimeout(() => {
    confetti({ ...base, particleCount: 90, spread: 110, startVelocity: 35, origin: { x: 0.5, y: 0.6 } });
  }, 180);
}

