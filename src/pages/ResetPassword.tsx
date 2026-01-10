import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BrandLogo } from '../components/BrandLogo';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Loader2 } from 'lucide-react';

type BootstrapStatus = 'idle' | 'bootstraping' | 'ready' | 'error';

/**
 * Parse URL parameters from query string or hash fragment
 */
function parseUrlParams(url: string): {
  code?: string;
  access_token?: string;
  refresh_token?: string;
  token_hash?: string;
  type?: string;
} {
  try {
    const urlObj = new URL(url);
    const params: Record<string, string> = {};

    // Parse query string (?code=...)
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // Parse hash fragment (#access_token=...)
    if (urlObj.hash) {
      const hashParams = new URLSearchParams(urlObj.hash.substring(1));
      hashParams.forEach((value, key) => {
        params[key] = value;
      });
    }

    return params;
  } catch (error) {
    console.error('[ResetPassword] Error parsing URL:', error);
    return {};
  }
}

/**
 * Bootstrap recovery session from URL tokens/code
 * Supports both PKCE (code) and implicit (hash fragment) flows
 */
async function bootstrapRecoverySession(url: string): Promise<{ ok: boolean; message?: string }> {
  console.log('[ResetPassword] bootstrapRecoverySession started', { url: url.substring(0, 100) });

  try {
    // 1) Check if session already exists
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession) {
      console.log('[ResetPassword] Session already exists');
      return { ok: true };
    }

    // 2) Parse URL parameters
    const params = parseUrlParams(url);
    console.log('[ResetPassword] Parsed params:', {
      hasCode: !!params.code,
      hasAccessToken: !!params.access_token,
      hasTokenHash: !!params.token_hash,
      type: params.type,
    });

    // 3) PKCE flow: ?code=... (or ?code=...&type=recovery)
    if (params.code) {
      console.log('[ResetPassword] Exchanging code for session (PKCE flow)');
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
      
      if (error) {
        console.error('[ResetPassword] exchangeCodeForSession error:', error);
        return { ok: false, message: error.message || 'Erreur lors de l\'échange du code' };
      }

      if (!data.session) {
        return { ok: false, message: 'Session non établie après échange du code' };
      }

      console.log('[ResetPassword] Session established via PKCE');
      return { ok: true };
    }

    // 4) Implicit flow: #access_token=...&refresh_token=... (or ?access_token=...)
    if (params.access_token && params.refresh_token) {
      console.log('[ResetPassword] Setting session from tokens (implicit flow)');
      const { data, error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });

      if (error) {
        console.error('[ResetPassword] setSession error:', error);
        return { ok: false, message: error.message || 'Erreur lors de la création de la session' };
      }

      if (!data.session) {
        return { ok: false, message: 'Session non établie après setSession' };
      }

      console.log('[ResetPassword] Session established via implicit flow');
      return { ok: true };
    }

    // 5) OTP recovery: ?token_hash=...&type=recovery
    if (params.token_hash) {
      console.log('[ResetPassword] Verifying OTP token (recovery flow)');
      const { data, error } = await supabase.auth.verifyOtp({
        type: (params.type as any) || 'recovery',
        token_hash: params.token_hash,
      } as any);

      if (error) {
        console.error('[ResetPassword] verifyOtp error:', error);
        return { ok: false, message: error.message || 'Erreur lors de la vérification du token' };
      }

      if (!data.session) {
        return { ok: false, message: 'Session non établie après verifyOtp' };
      }

      console.log('[ResetPassword] Session established via OTP');
      return { ok: true };
    }

    // No valid tokens found
    console.warn('[ResetPassword] No valid tokens/code found in URL');
    return { ok: false, message: 'Lien invalide ou incomplet. Réessaie depuis l\'email.' };
  } catch (error: any) {
    console.error('[ResetPassword] bootstrapRecoverySession error:', error);
    return { ok: false, message: error?.message || 'Erreur lors de l\'initialisation' };
  }
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>('idle');
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Bootstrap recovery session on mount
  useEffect(() => {
    let isMounted = true;
    let authStateSubscription: any = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tryBootstrap = async () => {
      console.log('[ResetPassword] Starting bootstrap...');
      setBootstrapStatus('bootstraping');
      setBootstrapError(null);

      // 1) Try sessionStorage (from DeepLinkGate on native)
      const fromStorage = sessionStorage.getItem('pending_deeplink');
      if (fromStorage) {
        console.log('[ResetPassword] Found deeplink in sessionStorage');
        const result = await bootstrapRecoverySession(fromStorage);
        if (!isMounted) return;

        if (result.ok) {
          sessionStorage.removeItem('pending_deeplink');
          setBootstrapStatus('ready');
          return;
        } else {
          console.warn('[ResetPassword] Bootstrap failed from storage:', result.message);
          // Keep it for potential retry, don't remove
        }
      }

      // 2) Try current URL (web)
      if (!Capacitor.isNativePlatform()) {
        const result = await bootstrapRecoverySession(window.location.href);
        if (!isMounted) return;

        if (result.ok) {
          setBootstrapStatus('ready');
          return;
        } else {
          console.warn('[ResetPassword] Bootstrap failed from URL:', result.message);
        }
      }

      // 3) Try getLaunchUrl (native cold start)
      if (Capacitor.isNativePlatform()) {
        try {
          const launch = await CapApp.getLaunchUrl();
          if (launch?.url) {
            console.log('[ResetPassword] Found launch URL');
            const result = await bootstrapRecoverySession(launch.url);
            if (!isMounted) return;

            if (result.ok) {
              setBootstrapStatus('ready');
              return;
            }
          }
        } catch (error) {
          console.error('[ResetPassword] Error getting launch URL:', error);
        }
      }

      // 4) Listen for appUrlOpen (native, app already open)
      if (Capacitor.isNativePlatform()) {
        authStateSubscription = await CapApp.addListener('appUrlOpen', async ({ url }) => {
          if (!isMounted || !url) return;
          console.log('[ResetPassword] appUrlOpen received:', url);

          const result = await bootstrapRecoverySession(url);
          if (!isMounted) return;

          if (result.ok) {
            setBootstrapStatus('ready');
          } else {
            console.warn('[ResetPassword] Bootstrap failed from appUrlOpen:', result.message);
          }
        });
      }

      // 5) Listen for PASSWORD_RECOVERY event from onAuthStateChange
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;
        console.log('[ResetPassword] Auth state changed:', event);

        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
          console.log('[ResetPassword] PASSWORD_RECOVERY event detected');
          setBootstrapStatus('ready');
        }
      });

      // 6) Timeout: if still not ready after 3s, show error
      timeoutId = setTimeout(() => {
        if (!isMounted) return;
        if (bootstrapStatus !== 'ready') {
          console.warn('[ResetPassword] Bootstrap timeout');
          setBootstrapError('Lien invalide ou expiré. Réessaie depuis l\'email.');
          setBootstrapStatus('error');
        }
      }, 3000);

      // Cleanup subscription
      return () => {
        subscription.unsubscribe();
      };
    };

    tryBootstrap().catch((error) => {
      console.error('[ResetPassword] Bootstrap error:', error);
      if (isMounted) {
        setBootstrapError('Erreur lors de l\'initialisation. Réessaie depuis l\'email.');
        setBootstrapStatus('error');
      }
    });

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      authStateSubscription?.remove?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    // Validation
    if (password.length < 8) {
      setSaveError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setSaveError('Les mots de passe ne correspondent pas.');
      return;
    }

    // Check session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaveError('Session expirée. Réessaie depuis l\'email.');
      return;
    }

    setSaving(true);
    try {
      console.log('[ResetPassword] Updating password...');
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        console.error('[ResetPassword] updateUser error:', error);
        setSaveError(error.message || 'Impossible de changer le mot de passe.');
        setSaving(false);
        return;
      }

      console.log('[ResetPassword] Password updated successfully');
      setSaveSuccess(true);

      // Sign out and redirect to login after 2s
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (error: any) {
      console.error('[ResetPassword] Unexpected error:', error);
      setSaveError(error?.message || 'Une erreur inattendue est survenue.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-2">
            <BrandLogo size={48} color="#111" />
          </div>
        </div>

        <div className="bg-card-light rounded-xl shadow-sm border border-gray-200 p-6">
          <h1 className="text-xl font-bold mb-2 text-text-main-light">Nouveau mot de passe</h1>

          {/* Bootstrap loading */}
          {(bootstrapStatus === 'idle' || bootstrapStatus === 'bootstraping') && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-text-sub-light">Chargement…</p>
            </div>
          )}

          {/* Bootstrap error */}
          {bootstrapStatus === 'error' && bootstrapError && (
            <div className="py-4">
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                <p className="text-sm font-medium mb-1">Erreur</p>
                <p className="text-sm">{bootstrapError}</p>
              </div>
              <a
                href="/login"
                className="text-sm text-primary hover:underline font-medium"
              >
                ← Retour à la connexion
              </a>
            </div>
          )}

          {/* Ready: show form */}
          {bootstrapStatus === 'ready' && !saveSuccess && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-text-main-light">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  disabled={saving}
                  minLength={8}
                />
                <p className="text-xs text-text-sub-light">Minimum 8 caractères</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-text-main-light">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={saving}
                  minLength={8}
                />
              </div>

              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {saveError}
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !password || !confirmPassword}
                className="w-full bg-primary text-black font-bold py-2 rounded-lg hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enregistrement…
                  </span>
                ) : (
                  'Valider'
                )}
              </button>
            </form>
          )}

          {/* Success */}
          {saveSuccess && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-text-main-light font-medium mb-4">Mot de passe mis à jour ✅</p>
              <p className="text-sm text-text-sub-light mb-4">Redirection vers la connexion...</p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full bg-primary text-black font-bold py-2 rounded-lg hover:brightness-95 transition-colors"
              >
                Se connecter
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
