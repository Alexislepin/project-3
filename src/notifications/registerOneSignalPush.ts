import { Capacitor } from '@capacitor/core';
import { initializeOneSignalOnce } from './initOneSignal';
import { waitForDeviceReadyAndOneSignal } from '../utils/onesignal';

/**
 * Register push notifications with OneSignal
 * Call this AFTER OneSignal initialization and permission request
 * 
 * This function:
 * 1. Requests permission (if not already granted)
 * 2. Sets up subscription listener to verify registration
 * 
 * @returns Promise<boolean> - true if permission granted, false otherwise
 */
export async function registerOneSignalPush(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[ONESIGNAL PUSH] ⏭️ Skipping push registration (not on native platform)');
    return true; // On web, consider it "granted"
  }

  console.log('[ONESIGNAL PUSH] 🔵 registerOneSignalPush() called');

  try {
    // Ensure OneSignal is initialized
    await initializeOneSignalOnce();
    const OneSignal = await waitForDeviceReadyAndOneSignal();

    if (!OneSignal) {
      console.error('[ONESIGNAL PUSH] ❌ OneSignal SDK not found');
      return false;
    }

    if (!OneSignal.Notifications) {
      console.error('[ONESIGNAL PUSH] ❌ OneSignal.Notifications API not available');
      return false;
    }

    // Check current permission
    let currentPermission: boolean | undefined;
    if (typeof OneSignal.Notifications.getPermission === 'function') {
      currentPermission = await OneSignal.Notifications.getPermission();
    } else if (typeof OneSignal.Notifications.permissionNative === 'boolean') {
      currentPermission = OneSignal.Notifications.permissionNative;
    } else if (typeof (OneSignal.Notifications as any)._permission === 'boolean') {
      currentPermission = (OneSignal.Notifications as any)._permission;
    }

    console.log('[ONESIGNAL PUSH] Current permission status:', currentPermission);

    // Request permission if not already granted
    if (currentPermission !== true) {
      console.log('[ONESIGNAL PUSH] 🔵 Requesting permission...');
      const permission = await OneSignal.Notifications.requestPermission(true);
      console.log('[ONESIGNAL PUSH] 🔔 Push permission:', permission);

      if (permission !== true) {
        console.warn('[ONESIGNAL PUSH] ⚠️ Permission not granted:', permission);
        return false;
      }
    } else {
      console.log('[ONESIGNAL PUSH] ✅ Permission already granted');
    }

    // 🔎 Pour vérifier que ça marche (obligatoire)
    // Add listener to verify subscription state
    if (OneSignal.User && OneSignal.User.pushSubscription) {
      try {
        OneSignal.User.pushSubscription.addEventListener('change', (state: any) => {
          console.log('[ONESIGNAL PUSH] 📱 Push subscription state:', {
            token: state?.current?.token,
            tokenValue: state?.current?.token?.value,
            optedIn: state?.current?.optedIn,
            id: state?.current?.id,
            userId: state?.current?.userId,
            subscriptionId: state?.current?.subscriptionId,
            state: JSON.stringify(state),
          });

          // Verify that token is non-null and optedIn is true
          const token = state?.current?.token?.value || state?.current?.token;
          const optedIn = state?.current?.optedIn;

          if (token && optedIn === true) {
            console.log('[ONESIGNAL PUSH] ✅ Push subscription verified: token present and optedIn=true');
          } else {
            console.warn('[ONESIGNAL PUSH] ⚠️ Push subscription incomplete:', {
              hasToken: !!token,
              optedIn,
            });
          }
        });

        console.log('[ONESIGNAL PUSH] ✅ Subscription listener added');

        // Also check current subscription state immediately
        try {
          const currentState = OneSignal.User.pushSubscription.current;
          if (currentState) {
            console.log('[ONESIGNAL PUSH] 📱 Current push subscription state:', {
              token: currentState?.token,
              tokenValue: currentState?.token?.value,
              optedIn: currentState?.optedIn,
              id: currentState?.id,
              userId: currentState?.userId,
              subscriptionId: currentState?.subscriptionId,
            });
          }
        } catch (stateError: any) {
          console.warn('[ONESIGNAL PUSH] ⚠️ Could not read current subscription state:', {
            error: stateError,
            message: stateError?.message,
          });
        }
      } catch (listenerError: any) {
        console.error('[ONESIGNAL PUSH] ❌ Error setting up subscription listener:', {
          error: listenerError,
          errorString: JSON.stringify(listenerError),
          message: listenerError?.message,
          stack: listenerError?.stack,
        });
      }
    } else {
      console.warn('[ONESIGNAL PUSH] ⚠️ OneSignal.User.pushSubscription not available');
    }

    return true;
  } catch (error: any) {
    console.error('[ONESIGNAL PUSH] ❌ Error registering push:', {
      error,
      errorString: JSON.stringify(error),
      message: error?.message,
      stack: error?.stack,
    });
    return false;
  }
}

