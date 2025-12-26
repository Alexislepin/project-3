'use client';

import { useState } from 'react';
import Input from '../ui/Input';
import Button from '../ui/Button';

export default function Hero() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Veuillez entrer votre email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Veuillez entrer un email valide');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'inscription');
      }

      setIsSuccess(true);
      setEmail('');
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 py-20 noise-overlay">
      <div className="max-w-6xl mx-auto text-center">
        <h1 className="text-6xl md:text-8xl lg:text-9xl font-display font-bold mb-6">
          LEXU.
        </h1>
        
        <h2 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold mb-8">
          READ{' '}
          <span className="text-lexu-yellow">SMARTER.</span>
        </h2>

        <p className="text-lg md:text-xl text-lexu-white/70 max-w-2xl mx-auto mb-12 leading-relaxed">
          Ne lis plus seul. Lexu transforme la lecture en habitude sociale. Suis tes amis, capture tes citations, et tiens enfin tes objectifs.
        </p>

        {isSuccess ? (
          <div className="max-w-md mx-auto p-6 bg-lexu-yellow/10 border border-lexu-yellow/20 rounded-lg">
            <p className="text-lexu-yellow font-medium text-lg">
              Bienvenue dans le club ! 🎉
            </p>
            <p className="text-lexu-white/70 mt-2">
              On te recontacte très bientôt.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="email"
                placeholder="Ton email…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
                error={error}
                aria-label="Adresse email"
              />
              <Button type="submit" isLoading={isLoading} className="sm:w-auto">
                Rejoindre
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}










