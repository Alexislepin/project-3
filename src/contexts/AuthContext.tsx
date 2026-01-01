import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { scheduleGoalCheck } from '../utils/goalNotifications';
import { debugLog, debugError } from '../utils/logger';
import { mapAuthError, FriendlyAuthError } from '../lib/authErrors';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { handleOAuthCallback } from '../lib/oauth';
import { registerPush } from '../lib/push';

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

export interface UserProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  has_password: boolean;
  interests: string[];
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  profileLoading: boolean;
  profileResolved: boolean;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: FriendlyAuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: FriendlyAuthError | null }>;
  signOut: () => Promise<void>;
  refreshProfile: (userId?: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: any }>;
  isOnboardingComplete: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
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
      
      if (session) {
        console.log('[AUTH] INITIAL_SESSION: Session found on mount', {
          userId: session.user?.id,
          email: session.user?.email,
          expiresAt: session.expires_at,
        });
      } else {
        console.log('[AUTH] INITIAL_SESSION: No session found on mount');
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      safeTimeEnd('AUTH_INIT');

      if (session?.user) {
        console.log('[AUTH] User authenticated, scheduling goal check');
        scheduleGoalCheck(session.user.id);
        // Fetch profile after session is set
        refreshProfile(session.user.id);
      }
    }).catch((error) => {
      if (initTimeout) clearTimeout(initTimeout);
      if (!isMounted) return;
      
      console.error('[AUTH] Error getting session:', error);
      setLoading(false);
      safeTimeEnd('AUTH_INIT');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      
      console.log(`[AUTH] Auth state changed: ${event}`, {
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
      });
      
      // Logger explicitement les événements importants
      if (event === 'SIGNED_IN') {
        console.log('[AUTH] SIGNED_IN: User successfully signed in', {
          userId: session?.user?.id,
          email: session?.user?.email,
          provider: session?.user?.app_metadata?.provider,
        });
      } else if (event === 'INITIAL_SESSION') {
        console.log('[AUTH] INITIAL_SESSION: Initial session from onAuthStateChange', {
          hasSession: !!session,
          userId: session?.user?.id,
        });
      } else if (event === 'SIGNED_OUT') {
        console.log('[AUTH] SIGNED_OUT: User signed out');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('[AUTH] TOKEN_REFRESHED: Access token refreshed successfully');
      }
      
      // Intercepter les erreurs de refresh token
      // Si on a une session null inattendue (pas un SIGNED_OUT explicite) ou une erreur de refresh
      if (!session && event !== 'SIGNED_OUT' && user) {
        console.error('[AUTH] Session lost unexpectedly, possible refresh token error');
        // Vérifier explicitement si c'est une erreur de refresh token
        try {
          const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !currentSession) {
            console.error('[AUTH] Refresh token error detected:', sessionError);
            // Émettre un événement personnalisé pour que les composants puissent afficher un toast
            window.dispatchEvent(new CustomEvent('auth:session-expired', {
              detail: { message: 'Session expirée, reconnecte-toi' }
            }));
            // Forcer signOut propre
            await supabase.auth.signOut();
            return;
          }
        } catch (err) {
          console.error('[AUTH] Error checking session after state change:', err);
          // Si erreur, forcer signOut
          window.dispatchEvent(new CustomEvent('auth:session-expired', {
            detail: { message: 'Session expirée, reconnecte-toi' }
          }));
          await supabase.auth.signOut();
          return;
        }
      }
      
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        console.log('[AUTH] Session active, scheduling goal check');
        scheduleGoalCheck(session.user.id);
        // Fetch profile after session is set
        refreshProfile(session.user.id).then(async () => {
          // If OAuth user (Google), ensure has_password is false
          const provider = session.user.app_metadata?.provider;
          if (provider === 'google') {
            // Re-fetch profile to get latest data
            const { data: latestProfile } = await supabase
              .from('user_profiles')
              .select('has_password')
              .eq('id', session.user.id)
              .single();
            
            if (latestProfile && latestProfile.has_password !== false) {
              await updateProfile({ has_password: false });
            }
          }
        }).catch((err) => {
          debugError('[AUTH] Error in refreshProfile callback:', err);
        });
      } else {
        console.log('[AUTH] No active session');
        setProfile(null);
        setProfileResolved(false);
      }
    });

    return () => {
      isMounted = false;
      if (initTimeout) clearTimeout(initTimeout);
      subscription.unsubscribe();
    };
  }, []);

  // Deep link handler for iOS/Android OAuth callbacks
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    if (!isNative) return;

    let listener: any = null;

    const setupDeepLinkListener = async () => {
      try {
        // Handle cold start (app opened via deep link)
        const launch = await CapacitorApp.getLaunchUrl();
        if (launch?.url) {
          debugLog('[AUTH] OAuth callback received (cold start)', { url: launch.url });
          if (launch.url.startsWith('lexu://auth/callback')) {
            const { error } = await handleOAuthCallback(launch.url);
            if (error) {
              debugError('[AUTH] OAuth callback error (cold start)', error);
            } else {
              debugLog('[AUTH] OAuth callback successful (cold start)');
            }
          }
        }

        // Listen for deep links when app is already running
        listener = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
          debugLog('[AUTH] OAuth callback received', { url });

          if (!url) {
            debugError('[AUTH] Deep link URL is undefined');
            return;
          }

          if (url.startsWith('lexu://auth/callback')) {
            const { error } = await handleOAuthCallback(url);
            if (error) {
              debugError('[AUTH] OAuth callback error', error);
            } else {
              debugLog('[AUTH] OAuth callback successful');
            }
          } else {
            debugLog('[AUTH] Deep link ignored (not OAuth callback)', { url });
          }
        });

        debugLog('[AUTH] Deep link listener registered');
      } catch (error) {
        debugError('[AUTH] Error setting up deep link listener', error);
      }
    };

    setupDeepLinkListener();

    return () => {
      if (listener) {
        listener.remove();
      }
    };
  }, []);

  const refreshProfile = async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    try {
      debugLog('[AUTH] Fetching user profile...', { userId: targetUserId });
      
      // Step 1: Try to fetch profile
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      // Step 2: Handle errors (log but continue)
      if (error) {
        debugError('[AUTH] Error fetching profile:', error);
        // Continue to create profile if data is null
      }

      // Step 3: If profile exists, use it
      if (data) {
        debugLog('[AUTH] Profile fetched successfully');
        setProfile(data as UserProfile);
        setProfileResolved(true);
        setProfileLoading(false);
        // Register for push notifications if enabled
        if ((data as any).notifications_enabled && user?.id) {
          registerPush(user.id);
        }
        return;
      }

      // Step 4: Profile doesn't exist, create minimal one using upsert
      // IMPORTANT: Use minimal payload to avoid overwriting existing profile fields
      debugLog('[AUTH] Profile not found, creating minimal profile...');
      
      // Determine has_password based on auth provider
      const { data: authUser } = await supabase.auth.getUser();
      const provider = authUser?.user?.app_metadata?.provider || 'email';
      const hasPassword = provider === 'email';

      // Minimal payload: only id and has_password (don't overwrite sensitive fields)
      const { data: upsertedProfile, error: upsertError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            id: targetUserId,
            has_password: hasPassword,
          },
          {
            onConflict: 'id',
            ignoreDuplicates: false,
          }
        )
        .select('onboarding_completed')
        .single();

      if (upsertError) {
        debugError('[AUTH] Error upserting profile:', upsertError);
        // Try to fetch existing profile
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', targetUserId)
          .maybeSingle();
        
        if (existingProfile) {
          setProfile(existingProfile as UserProfile);
          setProfileResolved(true);
        } else {
          setProfile(null);
        }
      } else {
        // Re-fetch full profile after upsert to get actual state
        const { data: fetchedProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', targetUserId)
          .single();
        
        if (fetchedProfile) {
          debugLog('[AUTH] Profile created/updated successfully, re-fetched state');
          setProfile(fetchedProfile as UserProfile);
          setProfileResolved(true);
          // Register for push notifications if enabled
          if ((fetchedProfile as any).notifications_enabled && user?.id) {
            registerPush(user.id);
          }
        } else {
          setProfile(null);
        }
      }
    } catch (err: any) {
      debugError('[AUTH] Error in refreshProfile:', err);
      setProfile(null);
      setProfileResolved(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) {
      return { error: { message: 'User not authenticated' } };
    }

    try {
      // Remove onboarding_completed and other protected fields from updates
      const safeUpdates = { ...updates };
      
      // Block regression of onboarding_completed (true -> false)
      if ('onboarding_completed' in safeUpdates) {
        const currentOnboardingState = profile?.onboarding_completed;
        const newOnboardingState = (safeUpdates as any).onboarding_completed;
        
        if (currentOnboardingState === true && newOnboardingState === false) {
          console.warn('[AUTH] ⚠️ Blocked onboarding_completed regression:', {
            userId: user.id,
            current: currentOnboardingState,
            attempted: newOnboardingState,
          });
          delete (safeUpdates as any).onboarding_completed;
        }
      }
      
      delete (safeUpdates as any).has_password;
      delete (safeUpdates as any).xp_total;
      delete (safeUpdates as any).current_streak;
      delete (safeUpdates as any).interests; // Interests should be managed separately

      debugLog('[AUTH] Updating profile safe payload keys:', Object.keys(safeUpdates));
      debugLog('[AUTH] Updating profile...', safeUpdates);
      
      const { error } = await supabase
        .from('user_profiles')
        .update(safeUpdates)
        .eq('id', user.id);

      if (error) {
        debugError('[AUTH] Error updating profile:', error);
        return { error };
      }

      // Refresh profile after update
      await refreshProfile();
      return { error: null };
    } catch (err: any) {
      debugError('[AUTH] Error in updateProfile:', err);
      return { error: { message: err.message || 'Erreur lors de la mise à jour du profil' } };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      debugLog('[AUTH] Signing up user...');
      // Créer le compte utilisateur (sans username/displayName)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined, // Pas de redirection email
        },
      });

      if (error) {
        debugError('[AUTH] Sign up error:', error);
        return { error: mapAuthError(error) };
      }

      if (!data.user) {
        return { error: { title: 'Erreur', message: 'Erreur lors de la création du compte', action: 'none' as const } };
      }

      // Créer le profil minimal (onboarding_completed = false) avec upsert
      const { error: upsertError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            id: data.user.id,
            username: null,
            display_name: null,
            bio: null,
            avatar_url: null,
            onboarding_completed: false,
            has_password: true, // User signed up with password
            interests: [],
            xp_total: 0,
            current_streak: 0,
          },
          {
            onConflict: 'id',
            ignoreDuplicates: false,
          }
        );

      if (upsertError) {
        debugError('[AUTH] Error upserting profile:', upsertError);
        // Continue anyway - profile might be created by trigger
      }

      debugLog('[AUTH] Sign up successful');
      return { error: null };
    } catch (err: any) {
      debugError('[AUTH] Error in signUp:', err);
      return { error: mapAuthError(err) };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: mapAuthError(error) };
      }

      return { error: null };
    } catch (err: any) {
      return { error: mapAuthError(err) };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isOnboardingComplete = profile?.onboarding_completed ?? false;

  const value = {
    user,
    session,
    profile,
    profileLoading,
    profileResolved,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    updateProfile,
    isOnboardingComplete,
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
