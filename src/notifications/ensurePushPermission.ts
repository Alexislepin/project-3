import { Capacitor } from '@capacitor/core';
import { initializeOneSignalOnce } from './initOneSignal';
import { waitForDeviceReadyAndOneSignal } from '../utils/onesignal';

/**
 * Ensure push permission is requested and push is registered
 * 
 * This function:
 * 1. Ensures OneSignal is initialized
 * 2. Requests permission (displays iOS popup and triggers APNs registration)
 * 3. Sets up subscription listener to verify registration
 * 
 * Call this after OneSignal initialization (at first launch, or via "Activate notifications" button)
 * 
 * @returns Promise<boolean> - true if permission granted, false otherwise
 */
export async function ensurePushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[ONESIGNAL] ⏭️ Skipping push permission (not on native platform)');
    return true; // On web, consider it "granted"
  }

  console.log('[ONESIGNAL] 🔵 ensurePushPermission() called');

  try {
    // Ensure OneSignal is initialized
    await initializeOneSignalOnce();
    const OneSignal = await waitForDeviceReadyAndOneSignal();

    if (!OneSignal) {
      console.error('[ONESIGNAL] ❌ OneSignal SDK not found');
      return false;
    }

    if (!OneSignal.Notifications) {
      console.error('[ONESIGNAL] ❌ OneSignal.Notifications API not available');
      return false;
    }

    // Affiche la popup iOS et déclenche l'enregistrement APNs
    const granted = await OneSignal.Notifications.requestPermission(true);
    console.log('[ONESIGNAL] 🔔 Push permission granted:', granted);

    if (granted !== true) {
      console.warn('[ONESIGNAL] ⚠️ Permission not granted:', granted);
      return false;
    }

    // Optionnel: debug état subscription
    if (OneSignal.User && OneSignal.User.pushSubscription) {
      try {
        OneSignal.User.pushSubscription.addEventListener('change', (state: any) => {
          console.log('[ONESIGNAL] 📱 pushSubscription change:', {
            state,
            current: state?.current,
            token: state?.current?.token,
            tokenValue: state?.current?.token?.value,
            optedIn: state?.current?.optedIn,
            id: state?.current?.id,
            userId: state?.current?.userId,
            subscriptionId: state?.current?.subscriptionId,
            previous: state?.previous,
          });
        });

        console.log('[ONESIGNAL] ✅ Subscription listener added');

        // Also check current subscription state immediately
        try {
          const currentState = OneSignal.User.pushSubscription.current;
          if (currentState) {
            console.log('[ONESIGNAL] 📱 Current push subscription state:', {
              token: currentState?.token,
              tokenValue: currentState?.token?.value,
              optedIn: currentState?.optedIn,
              id: currentState?.id,
              userId: currentState?.userId,
              subscriptionId: currentState?.subscriptionId,
            });
          }
        } catch (stateError: any) {
          console.warn('[ONESIGNAL] ⚠️ Could not read current subscription state:', {
            error: stateError,
            message: stateError?.message,
          });
        }
      } catch (listenerError: any) {
        console.error('[ONESIGNAL] ❌ Error setting up subscription listener:', {
          error: listenerError,
          errorString: JSON.stringify(listenerError),
          message: listenerError?.message,
          stack: listenerError?.stack,
        });
      }
    } else {
      console.warn('[ONESIGNAL] ⚠️ OneSignal.User.pushSubscription not available');
    }

    return true;
  } catch (error: any) {
    console.error('[ONESIGNAL] ❌ Error ensuring push permission:', {
      error,
      errorString: JSON.stringify(error),
      message: error?.message,
      stack: error?.stack,
    });
    return false;
  }
}

