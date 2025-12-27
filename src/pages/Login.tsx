import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message || 'Erreur lors de la connexion');
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
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold tracking-tight mb-2 text-text-main-light">Lexu</h1>
          <p className="text-text-sub-light">Suivez votre progression, construisez votre élan</p>
        </div>

        <div className="bg-card-light rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-semibold mb-6 text-text-main-light">Connexion</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-text-main-light text-white py-3 rounded-lg font-bold hover:bg-text-main-light/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

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
    </div>
  );
}

