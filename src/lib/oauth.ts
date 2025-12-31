import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { debugLog, debugError } from '../utils/logger';

/**
 * Sign in with Google OAuth
 * Handles both web and iOS/Android (Capacitor) platforms
 * @param options - Configuration options
 * @param options.forceAccount - If true, forces Google to show account selection screen
 */
export async function signInWithGoogle(options?: { forceAccount?: boolean }): Promise<{ error?: any }> {
  try {
    const isNative = Capacitor.isNativePlatform();
    const forceAccount = options?.forceAccount ?? false;

    // Build query params if forceAccount is true
    const queryParams: Record<string, string> = {};
    if (forceAccount) {
      queryParams.prompt = 'select_account';
      queryParams.access_type = 'offline';
    }

    if (isNative) {
      // iOS/Android: Use custom scheme with skipBrowserRedirect
      const redirectTo = 'lexu://auth/callback';
      
      debugLog('[OAuth] Starting Google sign-in (native)', { redirectTo, forceAccount });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        },
      });

      if (error) {
        debugError('[OAuth] Sign-in error', error);
        return { error };
      }

      const authUrl = data?.url;
      if (!authUrl) {
        const err = new Error('No OAuth URL returned');
        debugError('[OAuth] No URL received', err);
        return { error: err };
      }

      debugLog('[OAuth] Opening browser with URL', { url: authUrl });

      try {
        await Browser.open({ url: authUrl, presentationStyle: 'popover' });
        return {};
      } catch (browserError: any) {
        debugError('[OAuth] Browser.open error', browserError);
        return { error: browserError instanceof Error ? browserError : new Error('Impossible d\'ouvrir le navigateur') };
      }
    } else {
      // Web: Use standard redirect
      debugLog('[OAuth] Starting Google sign-in (web)', { forceAccount });
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        },
      });

      if (error) {
        debugError('[OAuth] Sign-in error', error);
        return { error };
      }

      // Sur le web, la redirection se fait automatiquement
      return {};
    }
  } catch (error: any) {
    debugError('[OAuth] Error:', error);
    return { error: error instanceof Error ? error : new Error('Erreur lors de la connexion Google') };
  }
}

/**
 * Handle OAuth callback from deep link
 * Extracts access_token and refresh_token from URL hash or query params
 * and sets the session using setSession
 */
export async function handleOAuthCallback(url: string): Promise<{ error?: any }> {
  try {
    debugLog('[OAuth] Handling callback', { url });

    if (!url || !url.startsWith('lexu://auth/callback')) {
      const err = new Error(`URL de callback invalide: ${url || 'undefined'}`);
      debugError('[OAuth] Invalid callback URL', err);
      return { error: err };
    }

    // Extract tokens from hash or query params
    let access_token: string | null = null;
    let refresh_token: string | null = null;

    try {
      const urlObj = new URL(url);
      
      // Check hash first (most common on mobile)
      if (urlObj.hash) {
        const hashParams = new URLSearchParams(urlObj.hash.substring(1)); // Remove '#'
        access_token = hashParams.get('access_token');
        refresh_token = hashParams.get('refresh_token');
        debugLog('[OAuth] Extracted tokens from hash', { 
          hasAccessToken: !!access_token, 
          hasRefreshToken: !!refresh_token 
        });
      }

      // If not in hash, check query params
      if (!access_token && urlObj.search) {
        const queryParams = new URLSearchParams(urlObj.search.substring(1)); // Remove '?'
        access_token = queryParams.get('access_token');
        refresh_token = queryParams.get('refresh_token');
        debugLog('[OAuth] Extracted tokens from query', { 
          hasAccessToken: !!access_token, 
          hasRefreshToken: !!refresh_token 
        });
      }
    } catch (parseError) {
      debugError('[OAuth] Error parsing URL', parseError);
      return { error: new Error('Erreur lors du parsing de l\'URL de callback') };
    }

    if (!access_token || !refresh_token) {
      const err = new Error('Missing tokens in callback URL');
      debugError('[OAuth] Missing tokens', { 
        hasAccessToken: !!access_token, 
        hasRefreshToken: !!refresh_token,
        url 
      });
      return { error: err };
    }

    // Set session using extracted tokens
    debugLog('[OAuth] Setting session with tokens');
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      debugError('[OAuth] setSession error', error);
      return { error };
    }

    debugLog('[OAuth] Successfully set session', { 
      userId: data?.user?.id,
      email: data?.user?.email 
    });

    // Close the browser if it's still open
    try {
      await Browser.close();
    } catch (e) {
      // Browser might already be closed, ignore
      debugLog('[OAuth] Browser already closed or error closing', e);
    }

    return {};
  } catch (error: any) {
    debugError('[OAuth] Callback handling error', error);
    return { error: error instanceof Error ? error : new Error('Erreur lors du traitement du callback OAuth') };
  }
}

