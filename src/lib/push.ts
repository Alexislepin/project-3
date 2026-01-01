import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

export async function registerPush(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    return;
  }

  await PushNotifications.register();

  PushNotifications.removeAllListeners().catch(() => {});

  PushNotifications.addListener('registration', async (token) => {
    const { error } = await supabase
      .from('user_devices')
      .upsert(
        {
          user_id: userId,
          platform: 'ios',
          push_token: token.value,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      );

    if (error) {
      console.error('[PUSH] Error saving device token:', error);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[PUSH] Registration error:', err);
  });
}
