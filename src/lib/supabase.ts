import { createClient } from '@supabase/supabase-js';
import { debugLog, fatalError } from '../utils/logger';

// Support both VITE_ and NEXT_PUBLIC_ prefixes for compatibility
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
