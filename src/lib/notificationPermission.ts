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

  // iOS/Android: utiliser Capacitor LocalNotifications
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') {
      return 'granted';
    }
    if (status.display === 'denied') {
      return 'denied';
    }
    return 'not-determined';
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

  // iOS/Android: utiliser Capacitor LocalNotifications
  try {
    const result = await LocalNotifications.requestPermissions();
    if (result.display === 'granted') {
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

