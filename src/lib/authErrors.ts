/**
 * Maps Supabase Auth errors to user-friendly French messages
 */

export type FriendlyAuthError = {
  title: string;
  message: string;
  action?: 'go_login' | 'go_signup' | 'none';
};

export function mapAuthError(err: any): FriendlyAuthError {
  if (!err) {
    return { title: 'Erreur', message: 'Une erreur est survenue. Réessayez.', action: 'none' };
  }

  const raw = String(err?.message || '').toLowerCase();
  const status = err?.status || err?.code;

  // Déjà inscrit
  if (
    status === 422 ||
    raw.includes('already registered') ||
    raw.includes('email already') ||
    raw.includes('user already registered') ||
    raw.includes('already exists')
  ) {
    return {
      title: 'Compte déjà existant',
      message: 'Un compte existe déjà avec ce courriel. Connectez-vous.',
      action: 'go_login',
    };
  }

  // Login invalide
  if (
    raw.includes('invalid login credentials') ||
    raw.includes('invalid credentials') ||
    raw.includes('email or password') ||
    status === 400
  ) {
    return {
      title: 'Connexion impossible',
      message: 'Courriel ou mot de passe incorrect.',
      action: 'none',
    };
  }

  // Mot de passe
  if (
    raw.includes('at least 6') ||
    raw.includes('password') ||
    raw.includes('password should be')
  ) {
    return {
      title: 'Mot de passe invalide',
      message: 'Le mot de passe doit contenir au moins 6 caractères.',
      action: 'none',
    };
  }

  // Rate limit
  if (raw.includes('too many') || raw.includes('rate') || status === 429) {
    return {
      title: 'Trop de tentatives',
      message: 'Réessayez dans quelques minutes.',
      action: 'none',
    };
  }

  // Email non confirmé
  if (raw.includes('email not confirmed') || raw.includes('email_not_confirmed')) {
    return {
      title: 'Courriel non confirmé',
      message: 'Vérifiez votre boîte mail pour confirmer votre adresse.',
      action: 'none',
    };
  }

  // Network error
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('connection')) {
    return {
      title: 'Erreur de connexion',
      message: 'Vérifiez votre connexion internet et réessayez.',
      action: 'none',
    };
  }

  // Default fallback
  return {
    title: 'Erreur',
    message: err?.message || 'Une erreur est survenue. Réessayez.',
    action: 'none',
  };
}

