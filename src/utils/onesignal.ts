import { getOneSignalInstance } from './getOneSignal';

/**
 * Wait for Cordova deviceready event and OneSignal plugin to be available
 * 
 * @returns OneSignal object if available, null otherwise
 */
export async function waitForDeviceReadyAndOneSignal(): Promise<any> {
  const w: any = window as any;

  if (!w.Capacitor?.isNativePlatform?.()) {
    return null;
  }

  // Wait for deviceready event (max 5000ms)
  await new Promise<void>((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, 5000);

    document.addEventListener(
      'deviceready',
      () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        console.log('[ONESIGNAL] deviceready fired');
        resolve();
      },
      { once: true }
    );
  });

  // Poll for OneSignal using normalized instance (max 5000ms, every 100ms)
  const start = Date.now();
  let os = getOneSignalInstance();

  while (!os && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 100));
    os = getOneSignalInstance();
  }

  console.log('[ONESIGNAL] OneSignal present?', !!os);
  return os || null;
}

