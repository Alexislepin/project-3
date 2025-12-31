import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { BrandLogo } from '../components/BrandLogo';

function parseHashParams(hash: string) {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return Object.fromEntries(params.entries());
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "ready" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    // Sur Supabase, les tokens arrivent dans le HASH (#...)
    const params = parseHashParams(window.location.hash);
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;
    const type = params.type;

    if (type !== "recovery" || !access_token || !refresh_token) {
      setStatus("error");
      setMsg("Lien invalide ou expiré. Réessaie depuis l'email.");
      return;
    }

    // Important: on set la session pour autoriser updateUser()
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setStatus("error");
          setMsg("Session de récupération invalide. Réessaie.");
        } else {
          setStatus("ready");
        }
      });
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
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");
      setMsg(error.message || "Impossible de changer le mot de passe.");
      return;
    }

    setStatus("done");
    setMsg("Mot de passe mis à jour ✅ Tu peux te reconnecter.");
    // Optionnel : logout pour forcer reconnexion propre
    // await supabase.auth.signOut();
    
    // Redirect to login after 2 seconds
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
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
              <label className="block text-sm font-medium mb-2 text-text-main-light">Nouveau mot de passe</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
              <label className="block text-sm font-medium mb-2 text-text-main-light">Confirmer</label>
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
                Enregistrer
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
              <p className="text-text-main-light font-medium">{msg}</p>
            </div>
          )}
          {msg && status !== "done" && <p className="mt-3 text-sm text-red-600">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
