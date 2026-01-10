import { Capacitor } from '@capacitor/core';
import { waitForDeviceReadyAndOneSignal } from '../utils/onesignal';

/**
 * Log error with full details
 */
function logError(context: string, error: any): void {
  console.error(`[ONESIGNAL] ❌ ${context}:`, {
    error,
    errorString: JSON.stringify(error),
    message: error?.message,
    stack: error?.stack,
    errorType: typeof error,
    keys: Object.keys(error || {}),
  });
}

/**
 * Global promise to ensure OneSignal is initialized only once
 */
let initPromise: Promise<void> | null = null;

/**
 * Initialize OneSignal SDK once (call this at app startup, before user login)
 * ⚠️ Without this → OneSignal won't create ANY user
 * 
 * Uses OneSignal.initialize() (API v5) or setAppId() (fallback)
 */
export function initializeOneSignalOnce(): Promise<void> {
  if (initPromise) {
    console.log('[ONESIGNAL] ⏭️ Initialization already in progress, reusing promise');
    return initPromise;
  }

  initPromise = (async () => {
    console.log('[ONESIGNAL] 🔵 initializeOneSignalOnce() called');
    
    if (!Capacitor.isNativePlatform()) {
      console.log('[ONESIGNAL] ⏭️ Skipping initialization (not on native platform)');
      return;
    }

    console.log('[ONESIGNAL] ✅ Platform check passed (native)');

    // Wait for device ready and OneSignal
    const OneSignal = await waitForDeviceReadyAndOneSignal();

    if (!OneSignal) {
      console.log('[ONESIGNAL] window.OneSignal missing');
      return;
    }

    console.log('[ONESIGNAL] ✅ OneSignal SDK found');
    console.log('[ONESIGNAL] 📋 OneSignal keys:', Object.keys(OneSignal));
    console.log('[ONESIGNAL] methods:', {
      hasSetAppId: typeof OneSignal?.setAppId === 'function',
      hasInitialize: typeof OneSignal?.initialize === 'function',
      hasLogin: typeof OneSignal?.login === 'function',
      hasSetExternalUserId: typeof OneSignal?.setExternalUserId === 'function',
    });

    try {
      const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
      
      if (!appId) {
        console.error('[ONESIGNAL] ❌ VITE_ONESIGNAL_APP_ID is not set in environment variables');
        return;
      }

      console.log('[ONESIGNAL] ✅ App ID found:', appId.substring(0, 8) + '...');
      
      if (typeof OneSignal.initialize === 'function') {
        console.log('[ONESIGNAL] 🔵 Calling OneSignal.initialize()...');
        console.log('[ONESIGNAL] init via initialize()');
        try {
          await OneSignal.initialize(appId);
          console.log('[ONESIGNAL] ✅ SDK initialized (initialize called)');
        } catch (initError: any) {
          // Fallback: try initialize({ appId }) if initialize(appId) fails
          console.log('[ONESIGNAL] ⚠️ initialize(appId) failed, trying initialize({ appId })...');
          try {
            await OneSignal.initialize({ appId });
            console.log('[ONESIGNAL] ✅ SDK initialized (initialize({ appId }) called)');
          } catch (initError2: any) {
            logError('initialize() failed with both signatures', initError2);
            throw initError2;
          }
        }
      } else if (typeof OneSignal.setAppId === 'function') {
        console.log('[ONESIGNAL] 🔵 Calling OneSignal.setAppId()...');
        console.log('[ONESIGNAL] init via setAppId()');
        await OneSignal.setAppId(appId);
        console.log('[ONESIGNAL] ✅ SDK initialized (setAppId called)');
      } else {
        console.error('[ONESIGNAL] ❌ No init method found', Object.keys(OneSignal));
        return;
      }

      // Optional: request permission prompt
      // await OneSignal.Notifications.requestPermission(true);
    } catch (error: any) {
      logError('Initialization error', error);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * @deprecated Use initializeOneSignalOnce() instead
 * Kept for backward compatibility
 */
export async function initializeOneSignal() {
  return initializeOneSignalOnce();
}

/**
 * Link OneSignal user to Supabase user ID
 * Call this after user is authenticated (SIGNED_IN or INITIAL_SESSION)
 * 
 * Guarantees that initialize() is called before login()
 */
export async function linkOneSignalUser(userId: string): Promise<void> {
  console.log('[ONESIGNAL] 🔵 linkOneSignalUser() called', { userId });
  
  if (!Capacitor.isNativePlatform()) {
    console.log('[ONESIGNAL] ⏭️ Skipping user linking (not on native platform)');
    return;
  }

  console.log('[ONESIGNAL] ✅ Platform check passed (native)');

  // Guarantee that AppId is set before login
  await initializeOneSignalOnce();

  // Wait for device ready and OneSignal
  const OneSignal = await waitForDeviceReadyAndOneSignal();

  if (!OneSignal) {
    console.log('[ONESIGNAL] window.OneSignal missing');
    return;
  }

  console.log('[ONESIGNAL] ✅ OneSignal SDK found');
  console.log('[ONESIGNAL] 📋 OneSignal keys:', Object.keys(OneSignal));
  console.log('[ONESIGNAL] methods:', {
    hasSetAppId: typeof OneSignal?.setAppId === 'function',
    hasInitialize: typeof OneSignal?.initialize === 'function',
    hasLogin: typeof OneSignal?.login === 'function',
    hasSetExternalUserId: typeof OneSignal?.setExternalUserId === 'function',
  });

  try {
    console.log('[ONESIGNAL] 🔵 Linking user to OneSignal', { userId });

    if (typeof OneSignal.login === 'function') {
      console.log('[ONESIGNAL] 🔵 Using OneSignal.login() (API v5)');
      
      // ÉTAPE 2: Ne JAMAIS appeler login() avant que OneSignal soit prêt
      // Attendre que l'appID soit bien présent côté SDK
      console.log('[ONESIGNAL] ⏳ Waiting for OneSignal._appID...');
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max
      
      while (!(OneSignal as any)._appID && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      
      if ((OneSignal as any)._appID) {
        console.log('[ONESIGNAL] ✅ OneSignal._appID found, calling login()');
      } else {
        console.warn('[ONESIGNAL] ⚠️ OneSignal._appID not found after waiting, proceeding anyway');
      }
      
      await OneSignal.login(userId);
      console.log('[ONESIGNAL] ✅ login() called:', userId);
    } else if (typeof OneSignal.setExternalUserId === 'function') {
      console.log('[ONESIGNAL] 🔵 Using OneSignal.setExternalUserId() (Cordova API)');
      OneSignal.setExternalUserId(
        userId,
        (results: any) => {
          console.log('[ONESIGNAL] ✅ setExternalUserId success callback:', {
            results: JSON.stringify(results),
            userId,
          });
        },
        (error: any) => {
          logError('setExternalUserId error callback', error);
        }
      );
      console.log('[ONESIGNAL] ✅ setExternalUserId called:', userId);
    } else {
      console.error('[ONESIGNAL] ❌ No login methods. keys=', Object.keys(OneSignal || {}));
    }
  } catch (error: any) {
    logError('User linking error', error);
  }
}

