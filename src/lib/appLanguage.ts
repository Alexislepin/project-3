import i18n from '../i18n';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Normalize language code to 'fr' or 'en'
 * Handles formats like 'fr-FR', 'en-US', 'fr', 'en', etc.
 */
export function normalizeLang(input: string | null | undefined): 'fr' | 'en' {
  if (!input) return 'fr';
  const normalized = input.toLowerCase().split('-')[0].trim();
  return normalized === 'en' ? 'en' : 'fr';
}

/**
 * Single source of truth for app language
 * Priority: i18n.resolvedLanguage > localStorage > 'fr'
 * Always returns normalized 'fr' or 'en'
 */
export function getCurrentLang(): 'fr' | 'en' {
  // Use i18n.resolvedLanguage (normalized) as primary source
  const lang = i18n.resolvedLanguage || i18n.language || localStorage.getItem('lexu_lang') || 'fr';
  return normalizeLang(lang);
}

/**
 * Set app language (single source of truth)
 * Updates: localStorage, i18n, and user_profiles.lang if user is connected
 * Always normalizes to 'fr' or 'en' before storing
 */
export async function setAppLanguage(lang: 'fr' | 'en' | string): Promise<void> {
  // Normalize language to 'fr' or 'en'
  const normalizedLang = normalizeLang(lang) as 'fr' | 'en';
  
  // 1. Save to localStorage (always normalized)
  localStorage.setItem('lexu_lang', normalizedLang);
  
  // 2. Change i18n language (this triggers re-renders)
  await i18n.changeLanguage(normalizedLang);
  
  // 3. Update user_profiles.lang if user is connected
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ lang: normalizedLang })
        .eq('id', user.id);
    }
  } catch (error) {
    console.warn('[setAppLanguage] Error updating user_profiles.lang:', error);
    // Continue even if update fails
  }
}

/**
 * Initialize language at app boot
 * Priority: user_profiles.lang > localStorage > navigator > 'fr'
 */
export async function initializeAppLanguage(): Promise<'fr' | 'en'> {
  try {
    // 1. Try to get from user_profiles if user is connected
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('lang')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile?.lang && (profile.lang === 'fr' || profile.lang === 'en')) {
        await setAppLanguage(profile.lang);
        return profile.lang;
      }
    }
  } catch (error) {
    console.warn('[initializeAppLanguage] Error loading from user_profiles:', error);
  }

  // 2. Fallback to localStorage
  const stored = localStorage.getItem('lexu_lang');
  if (stored === 'fr' || stored === 'en') {
    await setAppLanguage(stored);
    return stored;
  }

  // 3. Fallback to navigator
  if (typeof navigator !== 'undefined' && navigator.language) {
    const navLang = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr';
    await setAppLanguage(navLang);
    return navLang;
  }

  // 4. Default to 'fr'
  await setAppLanguage('fr');
  return 'fr';
}

/**
 * React hook to get current language and react to changes
 */
export function useAppLanguage(): 'fr' | 'en' {
  const [lang, setLang] = React.useState<'fr' | 'en'>(getCurrentLang);

  React.useEffect(() => {
    const updateLang = () => {
      setLang(getCurrentLang());
    };

    // Listen to i18n language changes
    i18n.on('languageChanged', updateLang);

    return () => {
      i18n.off('languageChanged', updateLang);
    };
  }, []);

  return lang;
}

import React from 'react';

