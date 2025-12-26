/**
 * Wrapper pour les haptics Capacitor avec fallback
 * Si @capacitor/haptics n'est pas installé, ne fait rien (pas d'erreur)
 */

let hapticsModule: any = null;

// Try to import haptics (may not be installed)
try {
  // Dynamic import to avoid errors if not installed
  import('@capacitor/haptics').then((module) => {
    hapticsModule = module;
  }).catch(() => {
    // Module not available, that's fine
  });
} catch {
  // Not available
}

/**
 * Trigger haptic feedback (light impact)
 * Safe to call even if haptics is not installed
 */
export async function triggerHapticFeedback(): Promise<void> {
  if (!hapticsModule) {
    // Haptics not available, silently fail
    return;
  }

  try {
    const { Haptics, ImpactStyle } = hapticsModule;
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (error) {
    // Silently fail if haptics not available or error
    console.debug('[Haptics] Not available:', error);
  }
}

