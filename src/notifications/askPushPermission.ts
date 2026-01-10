import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { waitForDeviceReadyAndOneSignal } from '../utils/onesignal';
import { initializeOneSignalOnce } from './initOneSignal';

/**
 * Ask for push notification permission
 * Should be called after user gesture (button click)
 * 
 * @returns { granted: boolean, canPromptAgain: boolean }
 */
export async function askPushPermission(): Promise<{ granted: boolean; canPromptAgain: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    return { granted: true, canPromptAgain: false };
  }

  await initializeOneSignalOnce();
  const OneSignal = await waitForDeviceReadyAndOneSignal();
  
  if (!OneSignal?.Notifications) {
    console.error('[ONESIGNAL] Notifications API not available');
    return { granted: false, canPromptAgain: false };
  }

  // Check current permission status
  // Selon versions, permission peut être boolean ou méthode getPermission()
  let current: boolean | undefined;
  
  if (typeof OneSignal.Notifications.getPermission === 'function') {
    current = await OneSignal.Notifications.getPermission();
  } else if (typeof OneSignal.Notifications.permissionNative === 'boolean') {
    current = OneSignal.Notifications.permissionNative;
  } else if (typeof (OneSignal.Notifications as any)._permission === 'boolean') {
    current = (OneSignal.Notifications as any)._permission;
  } else {
    current = false;
  }

  console.log('[ONESIGNAL] Current permission status:', current);

  if (current === true) {
    console.log('[ONESIGNAL] ✅ Permission already granted');
    return { granted: true, canPromptAgain: false };
  }

  // Request permission (iOS: si déjà refusé, requestPermission ne réaffichera souvent rien)
  console.log('[ONESIGNAL] 🔵 Requesting permission...');
  const granted = await OneSignal.Notifications.requestPermission(true);

  // Re-check permission after request
  let after: boolean | undefined;
  
  if (typeof OneSignal.Notifications.getPermission === 'function') {
    after = await OneSignal.Notifications.getPermission();
  } else if (typeof OneSignal.Notifications.permissionNative === 'boolean') {
    after = OneSignal.Notifications.permissionNative;
  } else if (typeof (OneSignal.Notifications as any)._permission === 'boolean') {
    after = (OneSignal.Notifications as any)._permission;
  } else {
    after = Boolean(granted);
  }

  const finalGranted = Boolean(after);
  console.log('[ONESIGNAL] Permission after request:', { granted, after, finalGranted });

  // Heuristique: si pas accordé après request → probablement "ne peut plus reprompt"
  const canPromptAgain = !finalGranted && granted !== false;

  return { granted: finalGranted, canPromptAgain };
}

/**
 * Open app notification settings
 * Opens iOS Settings app directly to notification settings for this app
 */
export async function openNotificationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[ONESIGNAL] Not on native platform, cannot open settings');
    return;
  }

  try {
    console.log('[ONESIGNAL] 🔵 Opening notification settings...');
    await App.openUrl({ url: 'app-settings:' });
    console.log('[ONESIGNAL] ✅ Settings opened');
  } catch (error: any) {
    console.error('[ONESIGNAL] ❌ Error opening settings:', {
      error,
      errorString: JSON.stringify(error),
      message: error?.message,
      stack: error?.stack,
    });
  }
}

