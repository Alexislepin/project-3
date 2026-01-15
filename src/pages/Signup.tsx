import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle } from '../lib/oauth';
import { BrandLogo } from '../components/BrandLogo';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ title?: string; message: string; action?: 'go_login' | 'go_signup' | 'none' } | string>('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp } = useAuth();
  const { mode, setMode, resolved } = useTheme();

  const toggleTheme = () => {
    setMode(mode === 'light' ? 'dark' : 'light');
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    
    const { error } = await signInWithGoogle({ forceAccount: true });
    
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

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password);

    if (error) {
      setError(error.message || 'Erreur lors de la création du compte');
      setLoading(false);
    } else {
      // Navigation sera gérée par App.tsx via AuthContext
      setLoading(false);
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
        <div className="text-center mb-8 pt-6">
          <div className="mb-1">
            <BrandLogo size={62} />
          </div>
          <p
            className="text-text-sub-light text-[11px]"
            style={{ verticalAlign: 'middle' }}
          >
            Suivez votre progression, construisez votre élan
          </p>
        </div>

        <div className="bg-card-light rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-text-main-light">Créer un compte</h2>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-2 py-1 rounded-full bg-black/5 text-text-main-light hover:bg-black/10 transition-colors"
              title={resolved === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
            >
              <Sun className={`w-4 h-4 ${resolved === 'dark' ? 'opacity-40' : 'opacity-100'}`} />
              <div
                className={`w-10 h-5 rounded-full relative transition-colors ${
                  resolved === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    resolved === 'dark' ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <Moon className={`w-4 h-4 ${resolved === 'dark' ? 'opacity-100' : 'opacity-40'}`} />
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              <p className="font-semibold mb-1">
                {typeof error === 'object' ? (error.title || 'Erreur') : 'Erreur'}
              </p>
              <p>{typeof error === 'object' ? error.message : error}</p>
              {typeof error === 'object' && error.action === 'go_login' && (
                <a
                  href="/login"
                  className="mt-2 inline-block text-sm font-semibold underline hover:text-red-800"
                >
                  Se connecter
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
              <label className="block text-sm font-medium text-text-main-light mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-text-main-light"
                placeholder="••••••••"
                required
                disabled={loading}
              />
              <p className="text-xs text-text-sub-light mt-1">Minimum 6 caractères</p>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-text-main-light text-white py-3 rounded-lg font-bold hover:bg-text-main-light/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? 'Création du compte...' : 'Créer un compte'}
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
              {googleLoading ? 'Connexion...' : 'S\'inscrire avec Google'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/login"
              className="text-text-sub-light hover:text-text-main-light text-sm transition-colors"
            >
              Vous avez déjà un compte ? <span className="font-semibold">Se connecter</span>
            </a>
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}

