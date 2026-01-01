import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { debugLog, fatalError } from '../utils/logger';

// Use Legacy anon key (JWT) - NOT the new sb_publishable_ keys
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY; // Legacy anon key (JWT format: eyJ...)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Legacy anon key, JWT format)');
}

// Custom storage adapter for Capacitor (iOS/Android) and web
// Uses @capacitor/preferences on native, localStorage on web
const customStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { value } = await Preferences.get({ key });
        return value;
      } else {
        return localStorage.getItem(key);
      }
    } catch (error) {
      console.error('[customStorage] getItem error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key, value });
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error('[customStorage] setItem error:', error);
      throw error;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('[customStorage] removeItem error:', error);
      throw error;
    }
  },
};

// Create Supabase client with proper configuration
// This client automatically adds Authorization (Bearer token) and apikey headers to all requests
// The apikey header is always added, even for unauthenticated requests
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Disable URL detection for iOS
    storage: customStorage,
  },
  // Ensure apikey header is always sent (Supabase client should do this automatically, but we're being explicit)
  global: {
    headers: {
      'apikey': supabaseAnonKey,
    },
  },
});

// Check au démarrage (dev only)
if (import.meta.env.DEV) {
  (async () => {
    try {
      const { error } = await supabase.from('user_profiles').select('count').limit(1);
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned, c'est OK
        fatalError('Supabase connection failed:', error);
      } else {
        debugLog('Supabase OK - URL:', supabaseUrl);
      }
    } catch (err) {
      fatalError('Supabase initialization error:', err);
    }
  })();
}
