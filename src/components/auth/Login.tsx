import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { BrandLogo } from '../BrandLogo';

interface LoginProps {
  onSwitchToSignup: () => void;
}

export function Login({ onSwitchToSignup }: LoginProps) {
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
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-2">
            <BrandLogo size={48} color="#111" />
          </div>
          <p className="text-text-sub-light">Suivez votre progression, construisez votre élan</p>
        </div>

        <div className="bg-card-light rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-semibold mb-6 text-text-main-light">Bienvenue</h2>

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
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-text-main-light text-white py-3 rounded-lg font-bold hover:bg-text-main-light/90 transition-colors disabled:opacity-50 mt-6"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={onSwitchToSignup}
              className="text-text-sub-light hover:text-text-main-light text-sm transition-colors"
            >
              Vous n'avez pas de compte ? <span className="font-semibold">S'inscrire</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
