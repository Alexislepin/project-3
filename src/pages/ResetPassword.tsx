import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { BrandLogo } from '../components/BrandLogo';
import { Capacitor } from '@capacitor/core';

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "ready" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    const initSession = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          // Native: wait for deep link (handled by App.tsx listener)
          // Check if we already have a session from the deep link
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setStatus("ready");
          } else {
            // No session yet, might be waiting for deep link
            // Check URL hash in case it's already there
            const hash = window.location.hash;
            if (hash.includes('access_token') && hash.includes('type=recovery')) {
              const { data, error } = await supabase.auth.getSessionFromUrl({ 
                storeSession: true 
              });
              if (error || !data.session) {
                setStatus("error");
                setMsg("Lien invalide ou expiré. Réessaie depuis l'email.");
              } else {
                setStatus("ready");
              }
            } else {
              setStatus("error");
              setMsg("Lien invalide ou expiré. Réessaie depuis l'email.");
            }
          }
        } else {
          // Web: get session from URL
          const { data, error } = await supabase.auth.getSessionFromUrl({ 
            storeSession: true 
          });
          
          if (error || !data.session) {
            setStatus("error");
            setMsg("Lien invalide ou expiré. Réessaie depuis l'email.");
          } else {
            setStatus("ready");
          }
        }
      } catch (err: any) {
        console.error('[ResetPassword] Error initializing session:', err);
        setStatus("error");
        setMsg("Erreur lors de l'initialisation. Réessaie depuis l'email.");
      }
    };

    initSession();
  }, []);

  const handleSave = async () => {
    setMsg("");

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
      
      // Sign out to force clean reconnection
      await supabase.auth.signOut();
      
      // Redirect to login after 2 seconds
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
              <p className="text-sm text-red-600 mb-4">{msg}</p>
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
