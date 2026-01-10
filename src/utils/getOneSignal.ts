/**
 * Get the normalized OneSignal instance from window
 * Handles different ways OneSignal can be exposed (ESM default, plugin wrapper, direct)
 */
export function getOneSignalInstance(): any | null {
  const w: any = window as any;
  const root = w.OneSignal;

  if (!root) return null;

  // Cas ESM / wrapper : methods dans default
  if (root.default && typeof root.default === 'object') return root.default;

  // Cas plugin exposé via OneSignalPlugin
  if (root.OneSignalPlugin && typeof root.OneSignalPlugin === 'object') return root.OneSignalPlugin;

  // Cas classique
  return root;
}

