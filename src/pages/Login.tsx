import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle } from '../lib/oauth';
import { BrandLogo } from '../components/BrandLogo';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ title?: string; message: string; action?: 'go_login' | 'go_signup' | 'none' } | string>('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState('');
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);
  const { signIn } = useAuth();

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    
    const { error } = await signInWithGoogle({ forceAccount: false });
    
    if (error) {
      setError(error.message || 'Erreur lors de la connexion Google');
      setGoogleLoading(false);
    }
    // Note: Si succès, le loading restera true car redirection/navigation
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error);
      setLoading(false);
    } else {
      // Navigation sera gérée par App.tsx via AuthContext
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetPasswordLoading(true);

    if (!resetPasswordEmail.trim()) {
      setError('Veuillez entrer votre adresse email');
      setResetPasswordLoading(false);
      return;
    }

    // Choose redirectTo based on platform (dev-friendly)
    const redirectTo = Capacitor.isNativePlatform()
      ? 'lexu://reset-password'
      : `${window.location.origin}/reset-password`; // => http://localhost:5173/reset-password ou 5174 etc.

    const { error } = await supabase.auth.resetPasswordForEmail(resetPasswordEmail.trim(), {
      redirectTo,
    });

    if (error) {
      setError(error.message || 'Erreur lors de l\'envoi de l\'email de réinitialisation');
      setResetPasswordLoading(false);
    } else {
      setResetPasswordSuccess(true);
      setResetPasswordLoading(false);
    }
  };

  return (
    <div className="h-screen bg-background-light flex flex-col overflow-hidden">
      {/* Scrollable content container */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        <div className="flex items-center justify-center min-h-full p-4">
          <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-2">
            <BrandLogo size={48} color="#111" />
          </div>
          <p className="text-text-sub-light">Suivez votre progression, construisez votre élan</p>
        </div>

        <div className="bg-card-light rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-semibold mb-6 text-text-main-light">Connexion</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              <p className="font-semibold mb-1">{typeof error === 'object' ? (error.title || 'Erreur') : 'Erreur'}</p>
              <p>{typeof error === 'object' ? error.message : error}</p>
              {typeof error === 'object' && error.action === 'go_signup' && (
                <a
                  href="/signup"
                  className="mt-2 inline-block text-sm font-semibold underline hover:text-red-800"
                >
                  S'inscrire
                </a>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-main-light mb-2">
                Courriel
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                placeholder="vous@exemple.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-text-main-light">
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPassword(true);
                    setResetPasswordEmail(email); // Pre-fill with current email
                  }}
                  className="text-sm text-black hover:text-black/80 transition-colors font-semibold underline underline-offset-2"
                  disabled={loading}
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-text-main-light text-white py-3 rounded-lg font-bold hover:bg-text-main-light/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-card-light text-text-sub-light">ou</span>
              </div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading || googleLoading}
              className="w-full mt-4 flex items-center justify-center gap-3 bg-white border border-gray-300 text-text-main-light py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {googleLoading ? 'Connexion...' : 'Se connecter avec Google'}
            </button>

            <div className="mt-3 text-center">
              <button
                onClick={async () => {
                  setGoogleLoading(true);
                  setError('');
                  const { error } = await signInWithGoogle({ forceAccount: true });
                  if (error) {
                    setError(error.message || 'Erreur lors de la connexion Google');
                    setGoogleLoading(false);
                  }
                }}
                disabled={loading || googleLoading}
                className="text-sm text-text-sub-light hover:text-text-main-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed underline"
              >
                Se connecter avec un autre compte
              </button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/signup"
              className="text-text-sub-light hover:text-text-main-light text-sm transition-colors"
            >
              Vous n'avez pas de compte ? <span className="font-semibold">S'inscrire</span>
            </a>
          </div>
        </div>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-md">
            {resetPasswordSuccess ? (
              <>
                <h3 className="text-xl font-semibold mb-4 text-text-main-light">
                  Email envoyé
                </h3>
                <p className="text-text-sub-light mb-6">
                  Nous avons envoyé un lien de réinitialisation à <strong>{resetPasswordEmail}</strong>. 
                  Vérifiez votre boîte de réception et suivez les instructions pour réinitialiser votre mot de passe.
                </p>
                <button
                  onClick={() => {
                    setShowResetPassword(false);
                    setResetPasswordSuccess(false);
                    setResetPasswordEmail('');
                  }}
                  className="w-full bg-primary text-black py-3 rounded-lg font-bold hover:brightness-95 transition-colors"
                >
                  Fermer
                </button>
              </>
            ) : (
              <>
                <h3 className="text-xl font-semibold mb-4 text-text-main-light">
                  Mot de passe oublié ?
                </h3>
                <p className="text-text-sub-light mb-6">
                  Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </p>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-main-light mb-2">
                      Courriel
                    </label>
                    <input
                      type="email"
                      value={resetPasswordEmail}
                      onChange={(e) => setResetPasswordEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                      placeholder="vous@exemple.com"
                      required
                      disabled={resetPasswordLoading}
                      autoFocus
                    />
                  </div>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      {typeof error === 'object' ? error.message : error}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetPassword(false);
                        setResetPasswordEmail('');
                        setError('');
                      }}
                      disabled={resetPasswordLoading}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-text-main-light hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={resetPasswordLoading}
                      className="flex-1 px-4 py-3 bg-primary text-black rounded-lg font-bold hover:brightness-95 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resetPasswordLoading ? 'Envoi...' : 'Envoyer'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

