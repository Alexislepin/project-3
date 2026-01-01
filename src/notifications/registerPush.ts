import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';

// Prevent duplicate listeners
let listenersAdded = false;

export async function registerPush(userId: string) {
  // Only work on native platforms
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // Prevent duplicate listeners
  if (listenersAdded) {
    return;
  }
  listenersAdded = true;

  try {
    // Request permissions
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      console.log('[PUSH] Permissions not granted');
      return;
    }

    // Register for push notifications
    await PushNotifications.register();

    // Add listener for registration success
    PushNotifications.addListener('registration', async (token) => {
      console.log('[PUSH] PUSH TOKEN', token.value);

      try {
        await supabase.from('user_devices').upsert({
          user_id: userId,
          platform: 'ios',
          push_token: token.value,
          last_seen_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,platform',
        });
        console.log('[PUSH] Device token saved to database');
      } catch (error) {
        console.error('[PUSH] Error saving device token:', error);
      }
    });

    // Add listener for registration errors
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[PUSH] registrationError', err);
    });
  } catch (error) {
    console.error('[PUSH] Error registering push notifications:', error);
    listenersAdded = false; // Reset on error to allow retry
  }
}

