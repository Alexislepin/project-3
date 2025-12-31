import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BrandLogo } from '../components/BrandLogo';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

type InitResult = { ok: true } | { ok: false; message: string };

function parseParamsFromUrl(url: string) {
  // Support query (?a=b) + hash (#a=b)
  let query = '';
  let hash = '';
  try {
    const u = new URL(url);
    query = u.search || '';
    hash = u.hash || '';
  } catch {
    // For safety if URL parsing fails (shouldn't on iOS)
    const qIdx = url.indexOf('?');
    const hIdx = url.indexOf('#');
    query = qIdx >= 0 ? url.slice(qIdx, hIdx >= 0 ? hIdx : undefined) : '';
    hash = hIdx >= 0 ? url.slice(hIdx) : '';
  }

  const searchParams = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

  const get = (k: string) => searchParams.get(k) || hashParams.get(k) || '';

  return {
    code: get('code'),
    access_token: get('access_token'),
    refresh_token: get('refresh_token'),
    token_hash: get('token_hash') || get('token'), // some templates use token_hash
    type: get('type'),
  };
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "ready" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let sub: any = null;
    let timeoutId: any = null;

    const initFromUrl = async (url: string): Promise<InitResult> => {
      try {
        const { code, access_token, refresh_token, token_hash, type } = parseParamsFromUrl(url);

        // 1) PKCE style: ?code=...
        if (code) {
          console.log('[ResetPassword] Exchanging code for session');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Session non établie après échange du code');
          return { ok: true };
        }

        // 2) Implicit style: #access_token=...&refresh_token=...
        if (access_token && refresh_token) {
          console.log('[ResetPassword] Setting session from tokens');
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Session non établie après setSession');
          return { ok: true };
        }

        // 3) OTP recovery style: ?token_hash=...&type=recovery
        // (some Supabase templates use token_hash for password recovery)
        if (token_hash) {
          const otpType = (type as any) || 'recovery';
          console.log('[ResetPassword] Verifying OTP', { otpType });
          const { error } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash,
          } as any);
          if (error) throw error;

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Session non établie après verifyOtp');
          return { ok: true };
        }

        return { ok: false, message: 'Lien invalide ou incomplet (pas de code/token).' };
      } catch (e: any) {
        return { ok: false, message: e?.message || "Erreur lors de l'initialisation. Réessaie depuis l'email." };
      }
    };

    const tryInitWithStorageOrUrl = async () => {
      // 1) Session storage (DeepLinkGate)
      const fromStorage = sessionStorage.getItem("pending_deeplink");
      if (fromStorage) {
        // ⚠️ IMPORTANT: remove ONLY if init succeeds
        const res = await initFromUrl(fromStorage);
        if (!alive) return;

        if (res.ok) {
          sessionStorage.removeItem("pending_deeplink");
          setInitError(null);
          setStatus("ready");
          return;
        }

        // keep it for potential retry (do not remove)
        console.warn('[ResetPassword] init failed from storage:', res.message);
      }

      // 2) Web fallback
      if (!Capacitor.isNativePlatform()) {
        const res = await initFromUrl(window.location.href);
        if (!alive) return;
        if (res.ok) {
          setInitError(null);
          setStatus("ready");
        } else {
          setInitError(res.message);
          setStatus("error");
        }
        return;
      }

      // 3) Native: try getLaunchUrl
      try {
        const launch = await CapApp.getLaunchUrl();
        if (launch?.url) {
          const res = await initFromUrl(launch.url);
          if (!alive) return;

          if (res.ok) {
            setInitError(null);
            setStatus("ready");
            return;
          }
        }
      } catch (e) {
        // ignore
      }

      // Still nothing -> stay idle and wait for appUrlOpen (up to 2s)
    };

    (async () => {
      setStatus("idle");
      await tryInitWithStorageOrUrl();
      if (!alive) return;

      if (!Capacitor.isNativePlatform()) return;

      // Listen for deep links arriving AFTER mount (cold start timing)
      sub = await CapApp.addListener("appUrlOpen", async ({ url }) => {
        if (!alive || !url) return;
        console.log('[ResetPassword] appUrlOpen received:', url);

        const res = await initFromUrl(url);
        if (!alive) return;

        if (res.ok) {
          setInitError(null);
          setStatus("ready");
        } else {
          // Don't instantly fail; could receive a non-reset link
          console.warn('[ResetPassword] appUrlOpen init failed:', res.message);
        }
      });

      // Final timeout: if still not ready after 2s, show error
      timeoutId = setTimeout(() => {
        if (!alive) return;
        if (status !== "ready") {
          setInitError("Lien invalide ou expiré. Réessaie depuis l'email.");
          setStatus("error");
        }
      }, 2000);
    })();

    return () => {
      alive = false;
      if (timeoutId) clearTimeout(timeoutId);
      sub?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setMsg("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMsg("Session expirée. Réessaie depuis l'email.");
      setStatus("error");
      return;
    }

    if (password.length < 8) {
      setMsg("Mot de passe trop court (8 caractères minimum).");
      return;
    }
    if (password !== confirm) {
      setMsg("Les mots de passe ne correspondent pas.");
      return;
    }

    setStatus("saving");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus("error");
        setMsg(error.message || "Impossible de changer le mot de passe.");
        return;
      }

      setStatus("done");
      setMsg("Mot de passe mis à jour ✅");

      await supabase.auth.signOut();

      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (err: any) {
      setStatus("error");
      setMsg(err?.message || "Une erreur inattendue est survenue.");
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

          {status === "idle" && <p className="text-text-sub-light">Chargement…</p>}
          
          {status === "ready" && (
            <>
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
              />
              <label className="block text-sm font-medium mb-2 text-text-main-light">
                Confirmer
              </label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
              <button
                onClick={handleSave}
                className="w-full bg-primary text-black font-bold py-2 rounded-lg hover:brightness-95 transition-colors"
              >
                Valider
              </button>
            </>
          )}

          {status === "saving" && <p className="text-text-sub-light">Enregistrement…</p>}
          
          {status === "done" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-text-main-light font-medium mb-4">{msg}</p>
              <button
                onClick={() => {
                  window.location.href = '/login';
                }}
                className="w-full bg-primary text-black font-bold py-2 rounded-lg hover:brightness-95 transition-colors"
              >
                Se connecter
              </button>
            </div>
          )}
          
          {msg && status === "error" && (
            <div className="mt-3">
              <p className="text-sm text-red-600 mb-4">{initError || msg}</p>
              <a
                href="/login"
                className="text-sm text-primary hover:underline font-medium"
              >
                ← Retour à la connexion
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
