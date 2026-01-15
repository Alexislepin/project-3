import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type NotificationPermissionStatus = 'not-determined' | 'granted' | 'denied';

export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!Capacitor.isNativePlatform()) {
    // Web: utiliser l'API Notification
    if (!('Notification' in window)) {
      return 'denied';
    }
    const permission = Notification.permission;
    if (permission === 'default') return 'not-determined';
    if (permission === 'granted') return 'granted';
    return 'denied';
  }

  // iOS/Android: utiliser PushNotifications (affiche le vrai prompt iOS)
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const status = await PushNotifications.checkPermissions();
    if (status.receive === 'granted') return 'granted';
    if (status.receive === 'denied') return 'denied';
    return 'not-determined'; // 'prompt' or unknown
  } catch (error) {
    console.error('Error checking notification permission:', error);
    return 'denied';
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (!Capacitor.isNativePlatform()) {
    // Web: utiliser l'API Notification
    if (!('Notification' in window)) {
      return 'denied';
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') return 'granted';
      return 'denied';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  // iOS/Android: utiliser PushNotifications (déclenche le prompt système)
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const result = await PushNotifications.requestPermissions();
    if (result.receive === 'granted') {
      // Optionnel mais recommandé: enregistrer pour push (sinon pas de token)
      try {
        await PushNotifications.register();
      } catch (regError) {
        console.warn('Push register error (ignored):', regError);
      }
      return 'granted';
    }
    return 'denied';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
}

export async function openSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { App } = await import('@capacitor/app');
    await App.openUrl({ url: 'app-settings:' });
  }
}

