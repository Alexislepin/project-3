import { supabase } from './supabase';
import { Capacitor } from '@capacitor/core';
import { debugLog, debugError } from '../utils/logger';

/**
 * Sign in with Google OAuth
 * Handles both web and iOS/Android (Capacitor) platforms
 */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  try {
    // Forcer redirectTo selon plateforme
    const redirectTo = Capacitor.isNativePlatform()
      ? 'lexu://auth/callback'
      : window.location.origin;

    debugLog('[OAuth] Starting Google sign-in', { 
      platform: Capacitor.isNativePlatform() ? 'native' : 'web',
      redirectTo 
    });

    if (Capacitor.isNativePlatform()) {
      // iOS/Android: Use custom scheme with skipBrowserRedirect
      // On doit utiliser skipBrowserRedirect: true pour ouvrir le navigateur manuellement
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        debugError('[OAuth] Sign-in error', error);
        return { error };
      }

      if (!data?.url) {
        const err = new Error('URL OAuth non reçue de Supabase');
        debugError('[OAuth] No URL received', err);
        return { error: err };
      }

      debugLog('[OAuth] Opening browser with URL', { url: data.url });

      // Ouvrir le navigateur Capacitor
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: data.url });
        
        // Le handler de deep link dans App.tsx capturera le callback
        return { error: null };
      } catch (browserError: any) {
        debugError('[OAuth] Browser.open error', browserError);
        return { error: browserError instanceof Error ? browserError : new Error('Impossible d\'ouvrir le navigateur') };
      }
    } else {
      // Web: Use standard redirect
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        debugError('[OAuth] Sign-in error', error);
        return { error };
      }

      // Sur le web, la redirection se fait automatiquement
      return { error: null };
    }
  } catch (error: any) {
    debugError('OAuth error:', error);
    return { error: error instanceof Error ? error : new Error('Erreur lors de la connexion Google') };
  }
}

/**
 * Handle OAuth callback from deep link
 * Called by App.tsx when appUrlOpen event fires
 */
export async function handleOAuthCallback(url: string): Promise<{ error: Error | null }> {
  try {
    debugLog('[OAuth] Handling callback', { url });

    if (!url || !url.startsWith('lexu://auth/callback')) {
      const err = new Error(`URL de callback invalide: ${url || 'undefined'}`);
      debugError('[OAuth] Invalid callback URL', err);
      return { error: err };
    }

    // Close the browser if it's still open
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
    } catch (e) {
      // Browser might already be closed, ignore
      debugLog('[OAuth] Browser already closed or error closing', e);
    }

    // Exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(url);

    if (error) {
      debugError('[OAuth] exchangeCodeForSession error', error);
      return { error };
    }

    debugLog('[OAuth] Successfully exchanged code for session');
    return { error: null };
  } catch (error: any) {
    debugError('[OAuth] Callback handling error', error);
    return { error: error instanceof Error ? error : new Error('Erreur lors du traitement du callback OAuth') };
  }
}

