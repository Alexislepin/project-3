/**
 * OneSignal Push Notifications Service for iOS (Capacitor/Cordova)
 * 
 * Handles:
 * - Initializing OneSignal SDK
 * - Requesting notification permissions
 * - Registering device/player ID with Supabase (user_devices table)
 * - Handling incoming push notifications
 * - Deep linking to app screens
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { getOneSignalInstance } from '../utils/getOneSignal';

// OneSignal App ID
const ONESIGNAL_APP_ID = '5d4c0d9c-a50d-415f-bda4-dcaeef2677ad';

// Track if OneSignal is already initialized to prevent duplicate initialization
let oneSignalInitialized = false;

export interface OneSignalNotificationData {
  type?: string;
  entity_id?: string;
  activity_id?: string;
  actor_id?: string;
  route?: string;
  [key: string]: any;
}

/**
 * Initialize OneSignal push notifications for a user
 * Call this once after login/restore session
 * 
 * @param userId - User ID from Supabase auth
 */
export async function initOneSignal(userId: string): Promise<void> {
  // Only on native platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('[ONESIGNAL] Not native platform, skipping OneSignal init');
    return;
  }

  // Prevent duplicate initialization
  if (oneSignalInitialized) {
    console.log('[ONESIGNAL] Already initialized, skipping');
    return;
  }

  const platform = Capacitor.getPlatform();
  console.log('[ONESIGNAL] Initializing OneSignal', { platform, userId, appId: ONESIGNAL_APP_ID });

  try {
    // Get normalized OneSignal instance
    const OneSignal = getOneSignalInstance();
    
    if (!OneSignal) {
      console.log('[ONESIGNAL] OneSignal instance not found');
      return;
    }

    // Initialize OneSignal with App ID
    OneSignal.setAppId(ONESIGNAL_APP_ID);
    console.log('[ONESIGNAL] OneSignal App ID set');

    // Request notification permission
    const permissionResult = await OneSignal.promptForPushNotificationsWithUserResponse();
    console.log('[ONESIGNAL] Permission result', { granted: permissionResult });

    if (!permissionResult) {
      console.log('[ONESIGNAL] Permissions denied by user');
      return;
    }

    // Set external user ID for targeting
    OneSignal.setExternalUserId(userId);
    console.log('[ONESIGNAL] External user ID set', { userId });

    // Get device/player ID
    // OneSignal provides player ID via getDeviceState or subscription observer
    const getPlayerId = async (): Promise<string | null> => {
      try {
        const deviceState = await OneSignal.getDeviceState();
        return deviceState?.userId || null;
      } catch (error: any) {
        console.warn('[ONESIGNAL] Error getting device state:', {
          error,
          errorString: JSON.stringify(error),
          message: error?.message,
          stack: error?.stack,
          errorType: typeof error,
          keys: Object.keys(error || {}),
        });
        return null;
      }
    };

    // Try to get player ID immediately
    let playerId = await getPlayerId();

    if (playerId) {
      console.log('[ONESIGNAL] Player ID obtained', { playerId: playerId.substring(0, 20) + '...' });
      await savePlayerIdToSupabase(userId, playerId);
    } else {
      console.log('[ONESIGNAL] Player ID not available yet, will retry when available');
      
      // Listen for subscription changes to get player ID when it becomes available
      OneSignal.addSubscriptionObserver((state: any) => {
        if (state?.userId && state.userId !== playerId) {
          const newPlayerId = state.userId;
          playerId = newPlayerId;
          console.log('[ONESIGNAL] Player ID received via subscription observer', {
            playerId: newPlayerId.substring(0, 20) + '...',
          });
          savePlayerIdToSupabase(userId, newPlayerId);
        }
      });
    }

    // Listen for notification received (foreground)
    OneSignal.addNotificationWillShowInForegroundHandler((notificationReceivedEvent: any) => {
      const notification = notificationReceivedEvent.getNotification();
      const data = notification.additionalData as OneSignalNotificationData;
      
      console.log('[ONESIGNAL] Notification received (foreground)', {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        data,
      });
      
      // Display the notification
      notificationReceivedEvent.complete(notification);
    });

    // Listen for notification opened (user tapped notification)
    OneSignal.addNotificationOpenedHandler((result: any) => {
      const notification = result.notification;
      const data = notification.additionalData as OneSignalNotificationData;
      
      console.log('[ONESIGNAL] Notification opened', {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        data,
      });

      // Handle deep linking if payload contains type/entity_id
      if (data) {
        if (data.route && data.entity_id) {
          console.log('[ONESIGNAL] Deep linking to route', { route: data.route, entityId: data.entity_id });
          window.location.href = `${data.route}/${data.entity_id}`;
        } else if (data.activity_id) {
          console.log('[ONESIGNAL] Deep linking to activity', { activityId: data.activity_id });
          window.location.href = `/activity/${data.activity_id}`;
        } else if (data.actor_id) {
          console.log('[ONESIGNAL] Deep linking to profile', { actorId: data.actor_id });
          window.location.href = `/profile/${data.actor_id}`;
        } else if (data.type && data.entity_id) {
          // Generic deep link based on type
          console.log('[ONESIGNAL] Deep linking by type', { type: data.type, entityId: data.entity_id });
          const routeMap: Record<string, string> = {
            'like': '/activity',
            'comment': '/activity',
            'follow': '/profile',
          };
          const route = routeMap[data.type] || '/home';
          window.location.href = `${route}/${data.entity_id}`;
        }
      }
    });

    oneSignalInitialized = true;
    console.log('[ONESIGNAL] Initialization complete');
  } catch (error: any) {
    console.error('[ONESIGNAL] Error initializing OneSignal:', {
      error,
      errorString: JSON.stringify(error),
      message: error?.message,
      stack: error?.stack,
      errorType: typeof error,
      keys: Object.keys(error || {}),
    });
  }
}

/**
 * Save OneSignal player ID to Supabase user_devices table
 */
async function savePlayerIdToSupabase(userId: string, playerId: string): Promise<void> {
  try {
    console.log('[ONESIGNAL] Saving player ID to Supabase', {
      userId,
      playerId: playerId.substring(0, 20) + '...',
      playerIdLength: playerId.length,
    });

    // Upsert into user_devices
    const { error } = await supabase
      .from('user_devices')
      .upsert(
        {
          user_id: userId,
          platform: 'ios',
          push_token: playerId,
        },
        {
          onConflict: 'user_id,push_token',
        }
      );

    if (error) {
      // If onConflict fails, try insert with ignore duplicates
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        console.log('[ONESIGNAL] Token already exists, trying insert with ignore');
        const { error: insertError } = await supabase
          .from('user_devices')
          .insert({
            user_id: userId,
            platform: 'ios',
            push_token: playerId,
          });

        if (insertError && !insertError.message?.includes('duplicate')) {
          console.error('[ONESIGNAL] Insert error', {
            code: insertError.code,
            message: insertError.message,
            details: (insertError as any).details,
          });
        } else {
          console.log('[ONESIGNAL] Player ID saved successfully (insert)');
        }
      } else {
        console.error('[ONESIGNAL] Upsert error', {
          code: error.code,
          message: error.message,
          details: (error as any).details,
        });
      }
    } else {
      console.log('[ONESIGNAL] Player ID saved successfully (upsert)', {
        userId,
        platform: 'ios',
      });
    }
  } catch (err: any) {
    console.error('[ONESIGNAL] Exception saving player ID:', {
      error: err,
      errorString: JSON.stringify(err),
      message: err?.message,
      stack: err?.stack,
      errorType: typeof err,
      keys: Object.keys(err || {}),
    });
  }
}

/**
 * Remove device token when user logs out
 */
export async function unregisterOneSignal(userId: string, playerId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('user_id', userId)
      .eq('push_token', playerId);

    if (error) {
      console.error('[ONESIGNAL] Error removing token:', {
        error,
        errorString: JSON.stringify(error),
        message: error.message,
        code: error.code,
        errorType: typeof error,
        keys: Object.keys(error || {}),
      });
    } else {
      console.log('[ONESIGNAL] Token removed successfully');
    }
  } catch (error: any) {
    console.error('[ONESIGNAL] Exception removing token:', {
      error,
      errorString: JSON.stringify(error),
      message: error?.message,
      stack: error?.stack,
      errorType: typeof error,
      keys: Object.keys(error || {}),
    });
  }
}
