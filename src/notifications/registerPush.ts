import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';

let registeredForUserId: string | null = null;

export async function registerPush(userId: string) {
  if (!Capacitor.isNativePlatform()) return;
  if (!userId) return;

  if (registeredForUserId === userId) return;
  registeredForUserId = userId;

  console.log('[PUSH] registerPush called', { userId });

  try {
    const perm = await PushNotifications.requestPermissions();
    console.log('[PUSH] permission result', perm);

    if (perm.receive !== 'granted') {
      registeredForUserId = null;
      return;
    }

    // Anti-doublons : removeAllListeners avant d'ajouter
    await PushNotifications.removeAllListeners();

    // IMPORTANT: listeners AVANT register (moins de race conditions)
    PushNotifications.addListener('registration', async (token) => {
      console.log('[PUSH] ✅ registration event received', token.value);

      const { data, error } = await supabase
        .from('user_devices')
        .upsert(
          {
            user_id: userId,
            platform: 'ios',
            push_token: token.value,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,platform' }
        )
        .select();

      console.log('[PUSH] upsert', { data, error });
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[PUSH] ❌ registrationError', err);
      registeredForUserId = null;
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[PUSH] received foreground', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[PUSH] action performed', action);
    });

    console.log('[PUSH] calling PushNotifications.register()');
    await PushNotifications.register();
  } catch (e) {
    console.error('[PUSH] registerPush error', e);
    registeredForUserId = null;
  }
}

