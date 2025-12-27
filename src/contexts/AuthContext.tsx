import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { scheduleGoalCheck } from '../utils/goalNotifications';

// Safe timer management to prevent double-invoke issues with React StrictMode
const endedTimers = new Set<string>();

function safeTimeEnd(name: string) {
  if (endedTimers.has(name)) return;
  try { 
    console.timeEnd(name); 
  } catch (e) {
    // Timer doesn't exist, ignore
  }
  endedTimers.add(name);
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!(window as any).__authInitStarted) {
      (window as any).__authInitStarted = true;
    console.time('AUTH_INIT');
    }
    console.log('[AUTH] Starting session check...');
    
    // FIX: Ne pas bloquer le render - initialiser loading à false après un court délai
    // pour permettre au UI de s'afficher immédiatement
    let initTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    initTimeout = setTimeout(() => {
      if (isMounted) {
        console.log('[AUTH] Timeout: allowing UI to render while auth loads');
        setLoading(false);
      }
    }, 100); // 100ms max pour afficher l'UI

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (initTimeout) clearTimeout(initTimeout);
      if (!isMounted) return;
      
      console.log('[AUTH] Session retrieved:', session ? 'authenticated' : 'not authenticated');
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      safeTimeEnd('AUTH_INIT');

      if (session?.user) {
        scheduleGoalCheck(session.user.id);
      }
    }).catch((error) => {
      if (initTimeout) clearTimeout(initTimeout);
      if (!isMounted) return;
      
      console.error('[AUTH] Error getting session:', error);
      setLoading(false);
      safeTimeEnd('AUTH_INIT');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      
      console.log('[AUTH] Auth state changed:', _event);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        scheduleGoalCheck(session.user.id);
      }
    });

    return () => {
      isMounted = false;
      if (initTimeout) clearTimeout(initTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, username: string, displayName: string) => {
    try {
      // Créer le compte utilisateur
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName,
          },
          emailRedirectTo: undefined, // Pas de redirection email
        },
      });

      if (error) {
        return { error };
      }

      if (!data.user) {
        return { error: { message: 'Erreur lors de la création du compte' } };
      }

      // Créer le profil immédiatement (ne pas attendre le trigger)
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: data.user.id,
          username,
          display_name: displayName,
          bio: '',
          avatar_url: '',
          interests: [],
        });

      if (insertError) {
        console.error('Erreur création profil:', insertError);
        // Si l'insertion échoue, essayer de vérifier si le trigger l'a créé
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();
        
        if (!existingProfile) {
          return { error: insertError };
        }
        // Le profil existe déjà (créé par le trigger), c'est bon
      }

      return { error: null };
    } catch (err: any) {
      console.error('Erreur signUp:', err);
      return { error: { message: err.message || 'Erreur lors de la création du compte' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
