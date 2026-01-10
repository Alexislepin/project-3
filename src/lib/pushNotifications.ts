/**
 * Push Notifications Service for iOS
 * 
 * Handles:
 * - Requesting push permissions
 * - Registering device tokens with Supabase (user_devices table with push_token column)
 * - Handling incoming push notifications
 * - Deep linking to app screens
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

export interface PushNotificationData {
  type: 'like' | 'comment' | 'follow' | 'reminder' | 'goal_achieved' | 'streak';
  activity_id?: string;
  comment_id?: string;
  actor_id?: string;
  route?: string;
  entity_id?: string;
  daily_goal_minutes?: number;
  [key: string]: any;
}

/**
 * Initialize push notifications for a user
 * Call this once after login/restore session
 * 
 * @param userId - User ID from Supabase auth
 */
export async function initPush(userId: string): Promise<void> {
  // Only on native platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('[PUSH] Not native platform, skipping push init');
    return;
  }

  const platform = Capacitor.getPlatform();
  console.log('[PUSH] Initializing push notifications', { platform, userId });

  try {
    // Request permissions
    const permResult = await PushNotifications.requestPermissions();
    
    if (permResult.receive === 'denied') {
      console.log('[PUSH] Permissions denied');
      return;
    }

    if (permResult.receive === 'prompt') {
      console.log('[PUSH] Permission prompt shown');
    } else if (permResult.receive === 'granted') {
      console.log('[PUSH] Permissions already granted');
    }

    // Register for push notifications
    await PushNotifications.register();
    console.log('[PUSH] Registration request sent');

    // Listen for registration token
    PushNotifications.addListener(
      'registration',
      async (token) => {
        console.log('[PUSH] Registration success', {
          platform,
          token: token.value.substring(0, 20) + '...',
          tokenLength: token.value.length,
        });

        try {
          // Upsert token in user_devices table
          // Using onConflict: 'user_id,push_token' if unique constraint exists
          // Otherwise, we'll use insert with ignore duplicates
          const { error } = await supabase
            .from('user_devices')
            .upsert(
              {
                user_id: userId,
                platform: 'ios',
                push_token: token.value,
              },
              {
                onConflict: 'user_id,push_token',
              }
            );

          if (error) {
            // If onConflict fails, try insert with ignore duplicates
            if (error.code === '23505' || error.message?.includes('duplicate')) {
              console.log('[PUSH] Token already exists, trying insert with ignore');
              const { error: insertError } = await supabase
                .from('user_devices')
                .insert({
                  user_id: userId,
                  platform: 'ios',
                  push_token: token.value,
                });

              if (insertError && !insertError.message?.includes('duplicate')) {
                console.error('[PUSH] Insert error', {
                  code: insertError.code,
                  message: insertError.message,
                  details: (insertError as any).details,
                });
              } else {
                console.log('[PUSH] Token saved successfully (insert)');
              }
            } else {
              console.error('[PUSH] Upsert error', {
                code: error.code,
                message: error.message,
                details: (error as any).details,
              });
            }
          } else {
            console.log('[PUSH] Token saved successfully (upsert)', {
              userId,
              platform: 'ios',
            });
          }
        } catch (err: any) {
          console.error('[PUSH] Exception saving token', {
            error: err?.message || String(err),
            stack: err?.stack,
          });
        }
      }
    );

    // Listen for registration errors
    PushNotifications.addListener(
      'registrationError',
      (error) => {
        console.error('[PUSH] Registration error', {
          error: error.error || String(error),
        });
      }
    );

    // Listen for notifications received while app is in foreground
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('[PUSH] Notification received (foreground)', {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        });
      }
    );

    // Listen for notification actions (user tapped notification)
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        console.log('[PUSH] Notification action performed', {
          actionId: action.actionId,
          notification: {
            id: action.notification.id,
            title: action.notification.title,
            body: action.notification.body,
            data: action.notification.data,
          },
        });

        // Handle deep linking if payload contains route/entity_id
        const data = action.notification.data as PushNotificationData;
        if (data) {
          if (data.route) {
            console.log('[PUSH] Deep linking to route', { route: data.route });
            // Navigate to route (adjust based on your routing system)
            if (data.entity_id) {
              window.location.href = `${data.route}/${data.entity_id}`;
            } else {
              window.location.href = data.route;
            }
          } else if (data.activity_id) {
            console.log('[PUSH] Deep linking to activity', { activityId: data.activity_id });
            window.location.href = `/activity/${data.activity_id}`;
          } else if (data.actor_id) {
            console.log('[PUSH] Deep linking to profile', { actorId: data.actor_id });
            window.location.href = `/profile/${data.actor_id}`;
          }
        }
      }
    );

    console.log('[PUSH] Listeners registered successfully');
  } catch (error: any) {
    console.error('[PUSH] Error initializing push notifications', {
      error: error?.message || String(error),
      stack: error?.stack,
    });
  }
}

/**
 * Remove device token when user logs out
 */
export async function unregisterPush(userId: string, pushToken: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('user_id', userId)
      .eq('push_token', pushToken);

    if (error) {
      console.error('[PUSH] Error removing token', {
        error: error.message,
        code: error.code,
      });
    } else {
      console.log('[PUSH] Token removed successfully');
    }
  } catch (error: any) {
    console.error('[PUSH] Exception removing token', {
      error: error?.message || String(error),
    });
  }
}
