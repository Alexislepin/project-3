import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BrandLogo } from '../components/BrandLogo';

export function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Check if user has a valid recovery session
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // No session, redirect to login
        window.location.href = '/login';
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword.trim()) {
      setError('Le mot de passe est requis');
      return;
    }

    if (newPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || 'Erreur lors de la mise à jour du mot de passe');
        setLoading(false);
        return;
      }

      // Success
      setSuccess(true);
      setLoading(false);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (err: any) {
      setError(err?.message || 'Une erreur inattendue est survenue');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="h-screen bg-background-light flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="mb-2">
              <BrandLogo size={48} color="#111" />
            </div>
          </div>
          <div className="bg-card-light rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-text-main-light">
                Mot de passe mis à jour
              </h2>
              <p className="text-text-sub-light">
                Votre mot de passe a été modifié avec succès. Redirection vers la page de connexion...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background-light flex flex-col overflow-hidden">
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
              <p className="text-text-sub-light">Définissez un nouveau mot de passe</p>
            </div>

            <div className="bg-card-light rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-semibold mb-6 text-text-main-light">Nouveau mot de passe</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    autoFocus
                  />
                  <p className="text-xs text-text-sub-light mt-1">Minimum 6 caractères</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main-light mb-2">
                    Confirmer le mot de passe
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-text-main-light text-white py-3 rounded-lg font-bold hover:bg-text-main-light/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                >
                  {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

