import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

let pushInitialized = false;

/**
 * Initialize push notifications and register device token
 * Should be called once after user login/session restore
 * 
 * @param userId - User ID from Supabase auth
 */
export async function initPush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[PUSH] Not native platform, skipping push init');
    return;
  }

  if (pushInitialized) {
    console.log('[PUSH] Already initialized, skipping');
    return;
  }

  console.log('[PUSH] Initializing push notifications', { userId });

  try {
    // Request permissions
    const permissionResult = await PushNotifications.requestPermissions();
    console.log('[PUSH] Permission result:', permissionResult);

    if (permissionResult.receive === 'granted') {
      console.log('[PUSH] Permission granted, registering...');
      
      // Register for push notifications
      await PushNotifications.register();
      console.log('[PUSH] Registration initiated');
    } else {
      console.log('[PUSH] Permission denied:', permissionResult.receive);
      return;
    }

    // Listener: registration success - receive token
    PushNotifications.addListener('registration', async (token) => {
      console.log('[PUSH] token received', token.value);

      if (!userId) {
        console.warn('[PUSH] missing userId, abort insert');
        return;
      }

      const { data, error } = await supabase
        .from('user_devices')
        .upsert(
          {
            user_id: userId,
            platform: 'ios',
            push_token: token.value,
          },
          { onConflict: 'user_id,platform' }
        );

      console.log('[PUSH] upsert', { data, error });
    });

    // Listener: registration error
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[PUSH] Registration error:', error);
    });

    // Listener: push notification received (foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[PUSH] Push notification received:', notification);
    });

    // Listener: push notification action performed (user tapped)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[PUSH] Push notification action performed:', action);

      const payload = action.notification.data as {
        route?: string;
        type?: string;
        entity_id?: string;
      };

      if (payload) {
        // Deep link handling
        if (payload.route && payload.entity_id) {
          window.location.href = `${payload.route}/${payload.entity_id}`;
        } else if (payload.type && payload.entity_id) {
          // Map type to route
          const routeMap: Record<string, string> = {
            activity: '/activity',
            profile: '/profile',
            book: '/book',
          };
          const route = routeMap[payload.type] || '/home';
          window.location.href = `${route}/${payload.entity_id}`;
        } else {
          // Default: go to home
          window.location.href = '/home';
        }
      }
    });

    pushInitialized = true;
    console.log('[PUSH] Push notifications initialized successfully');
  } catch (error) {
    console.error('[PUSH] Error initializing push notifications:', error);
    pushInitialized = false;
  }
}

// Backward-compatible alias used by NotificationSettingsModal
export const registerPush = initPush;
