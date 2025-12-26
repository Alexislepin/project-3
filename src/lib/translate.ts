import { supabase } from './supabase';
import { getCurrentLang } from './appLanguage';
import { getBookKey } from './bookSocial';

/**
 * Translate book description using Supabase Edge Function
 * @param text Text to translate
 * @param targetLang Target language ('fr' or 'en')
 * @param bookKey Optional book key for caching (format: isbn:..., ol:/works/..., uuid:..., etc.)
 * @returns Translated text or original text on error
 */
export async function translateText(
  text: string,
  targetLang: 'fr' | 'en',
  bookKey?: string
): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  try {
    console.debug('[translateText] Calling Edge Function - targetLang:', targetLang, 'bookKey:', bookKey, 'text length:', text.trim().length);
    
    // Use fetch directly with explicit headers (Authorization Bearer + apikey)
    // This ensures we use the Legacy anon key (JWT) correctly
    const anonJwt = import.meta.env.VITE_SUPABASE_ANON_KEY; // Legacy anon key (JWT format: eyJ...)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (!anonJwt || !supabaseUrl) {
      console.error('[translateText] Missing Supabase environment variables');
      return text;
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonJwt}`,
        'apikey': anonJwt,
      },
      body: JSON.stringify({
        text: text.trim(),
        target: targetLang,
        targetLang: targetLang, // ✅ compat - send both field names
        book_key: bookKey,
      }),
    });

    if (!res.ok) {
      console.error('[translateText] Edge Function HTTP error:', {
        status: res.status,
        statusText: res.statusText,
        targetLang,
        bookKey,
      });
      return text; // Return original on error
    }

    const data = await res.json();
    console.debug('[translateText] Translation response:', {
      version: data.meta?.version,
      didTranslate: data.meta?.didTranslate,
      provider: data.meta?.provider || 'unknown',
      reason: data.meta?.reason,
      originalLength: text.length,
      translatedLength: data.translatedText?.length,
      targetUsed: data.meta?.targetUsed,
    });

    // Even if error is set, check if we have translatedText (fallback case)
    if (data?.translatedText) {
      return data.translatedText;
    }

    console.warn('[translateText] No translatedText in response:', data);
    return text;
  } catch (error: any) {
    console.error('[translateText] Exception:', {
      error,
      message: error?.message,
      targetLang,
      bookKey,
    });
    return text; // Return original on error
  }
}

/**
 * Get translated description for a book
 * @param book Book object (to extract stable book_key)
 * @param originalDescription Original description text
 * @param targetLang Optional target language (defaults to current app language)
 * @returns Translated description or original if translation fails
 */
export async function getTranslatedDescription(
  book: any,
  originalDescription: string | null,
  targetLang?: 'fr' | 'en'
): Promise<string | null> {
  if (!originalDescription || originalDescription.trim().length === 0) {
    return null;
  }

  // Get target language from parameter or current app language (single source of truth)
  const finalTargetLang = targetLang || getCurrentLang();
  console.debug('[getTranslatedDescription] finalTargetLang:', finalTargetLang, 'sample:', originalDescription.slice(0, 60));

  // ⚠️ detectLanguage est trop peu fiable ici (résumés courts / markdown)
  // On laisse la function gérer le cas "déjà dans la bonne langue".
  // On ne court-circuite plus : on vérifie le cache puis on traduit si nécessaire.

  // Get stable book_key for caching
  const bookKey = getBookKey(book);
  console.debug('[getTranslatedDescription] bookKey:', bookKey);

  // Check cache first using Supabase client (not fetch)
  try {
    const { data: cached, error: cacheError } = await supabase
      .from('book_translations')
      .select('text')
      .eq('book_key', bookKey)
      .eq('lang', finalTargetLang)
      .maybeSingle();

    if (cacheError) {
      console.error('[getTranslatedDescription] Cache lookup error:', {
        error: cacheError,
        message: cacheError.message,
        code: cacheError.code,
        details: cacheError.details,
        hint: cacheError.hint,
        bookKey,
        lang: finalTargetLang,
      });
      // Continue to translation even if cache lookup fails
    } else if (cached && cached.text) {
      console.debug('[getTranslatedDescription] Cache hit - returning cached translation');
      return cached.text;
    } else {
      console.debug('[getTranslatedDescription] Cache miss - no translation found in cache');
    }
  } catch (error: any) {
    console.error('[getTranslatedDescription] Cache lookup exception:', {
      error,
      message: error?.message,
      bookKey,
      lang: finalTargetLang,
    });
    // Continue to translation even if cache lookup fails
  }

  // Translate if not cached
  const translated = await translateText(originalDescription, finalTargetLang, bookKey);
  return translated;
}

