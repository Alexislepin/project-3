/**
 * Push Notifications Service for iOS
 * 
 * Handles:
 * - Requesting push permissions
 * - Registering device tokens with Supabase
 * - Handling incoming push notifications
 * - Deep linking to app screens
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

export interface PushNotificationData {
  type: 'like' | 'comment' | 'follow' | 'reminder' | 'goal_achieved' | 'streak';
  activity_id?: string;
  comment_id?: string;
  actor_id?: string;
  daily_goal_minutes?: number;
  [key: string]: any;
}

/**
 * Request push notification permissions and register device
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Push notifications only work on native platforms');
    return null;
  }

  try {
    // Request permission
    let permResult = await PushNotifications.requestPermissions();
    
    if (permResult.receive === 'prompt') {
      // User will see the permission prompt
      console.log('Push permission prompt shown');
    } else if (permResult.receive === 'denied') {
      console.log('Push notifications denied');
      return null;
    }

    // Register for push notifications
    await PushNotifications.register();

    // Wait for registration token
    return new Promise((resolve) => {
      const tokenListener = PushNotifications.addListener('registration', async (token) => {
        console.log('Push registration success, token:', token.value);
        
        // Store token in Supabase
        const { user } = (await supabase.auth.getUser()).data;
        if (user) {
          await saveDeviceToken(user.id, token.value);
        }
        
        tokenListener.remove();
        resolve(token.value);
      });

      const errorListener = PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error);
        errorListener.remove();
        resolve(null);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        tokenListener.remove();
        errorListener.remove();
        resolve(null);
      }, 10000);
    });
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Save device token to Supabase
 */
async function saveDeviceToken(userId: string, deviceToken: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const appVersion = await getAppVersion();

    const { error } = await supabase
      .from('user_devices')
      .upsert(
        {
          user_id: userId,
          device_token: deviceToken,
          platform: 'ios',
          device_id: deviceId,
          app_version: appVersion,
          last_used_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,device_token',
        }
      );

    if (error) {
      console.error('Error saving device token:', error);
    } else {
      console.log('Device token saved successfully');
    }
  } catch (error) {
    console.error('Exception saving device token:', error);
  }
}

/**
 * Get device identifier (optional)
 */
async function getDeviceId(): Promise<string | null> {
  try {
    // Use Capacitor's device plugin if available
    const { Device } = await import('@capacitor/device');
    const device = await Device.getInfo();
    return device.id || null;
  } catch {
    return null;
  }
}

/**
 * Get app version
 */
async function getAppVersion(): Promise<string | null> {
  try {
    const appInfo = await App.getInfo();
    return appInfo.version || null;
  } catch {
    return null;
  }
}

/**
 * Setup push notification listeners
 * Call this once when app starts
 */
export function setupPushNotificationListeners(
  onNotificationReceived: (data: PushNotificationData) => void
): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {}; // No-op cleanup
  }

  // Handle notification received while app is in foreground
  const notificationReceivedListener = PushNotifications.addListener(
    'pushNotificationReceived',
    (notification) => {
      console.log('Push notification received (foreground):', notification);
      
      // Extract custom data
      const data = notification.data as PushNotificationData;
      if (data) {
        onNotificationReceived(data);
      }
    }
  );

  // Handle notification tapped (app was in background/closed)
  const notificationActionPerformedListener = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      console.log('Push notification action performed:', action);
      
      const data = action.notification.data as PushNotificationData;
      if (data) {
        onNotificationReceived(data);
      }
    }
  );

  // Cleanup function
  return () => {
    notificationReceivedListener.remove();
    notificationActionPerformedListener.remove();
  };
}

/**
 * Navigate to appropriate screen based on notification data
 */
export function handleNotificationNavigation(data: PushNotificationData): void {
  // This will be called from your router/navigation system
  // Adjust based on your routing setup
  
  switch (data.type) {
    case 'like':
    case 'comment':
      if (data.activity_id) {
        // Navigate to activity detail
        window.location.href = `/activity/${data.activity_id}`;
      }
      break;
    
    case 'follow':
      if (data.actor_id) {
        // Navigate to user profile
        window.location.href = `/profile/${data.actor_id}`;
      }
      break;
    
    case 'reminder':
      // Navigate to home or goals screen
      window.location.href = '/home';
      break;
    
    default:
      // Default to home
      window.location.href = '/home';
  }
}

/**
 * Remove device token when user logs out
 */
export async function unregisterDeviceToken(userId: string, deviceToken: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('user_id', userId)
      .eq('device_token', deviceToken);

    if (error) {
      console.error('Error removing device token:', error);
    }
  } catch (error) {
    console.error('Exception removing device token:', error);
  }
}

