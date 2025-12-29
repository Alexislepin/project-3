import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { canonicalBookKey } from '../lib/bookSocial';

interface UseBookBlurbInput {
  book_key?: string | null;
  isbn?: string | null;
  id?: string | null;
  title?: string | null;
  author?: string | null;
}

interface UseBookBlurbResult {
  blurb: string | null;
  loading: boolean;
  status: 'ready' | 'generating' | 'error' | 'no_data' | null;
}

/**
 * Hook pour récupérer et générer un blurb (résumé court) pour un livre
 * Cache-first: lit d'abord en DB, puis déclenche la génération en arrière-plan si nécessaire
 */
export function useBookBlurb(book: UseBookBlurbInput | null): UseBookBlurbResult {
  const [blurb, setBlurb] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'ready' | 'generating' | 'error' | 'no_data' | null>(null);

  useEffect(() => {
    if (!book) {
      setBlurb(null);
      setLoading(false);
      setStatus(null);
      return;
    }

    // Normaliser book_key
    let bookKey: string | null = null;
    if (book.book_key) {
      bookKey = book.book_key;
    } else {
      // Utiliser canonicalBookKey si on a un objet book
      bookKey = canonicalBookKey(book as any);
      if (bookKey === 'unknown') {
        bookKey = null;
      }
    }

    if (!bookKey) {
      setBlurb(null);
      setLoading(false);
      setStatus(null);
      return;
    }

    // 1) Essayer de lire le cache immédiatement
    setLoading(true);
    (async () => {
      try {
        const { data: cached, error } = await supabase
          .from('book_blurbs')
          .select('blurb, status, updated_at')
          .eq('book_key', bookKey)
          .eq('language', 'fr')
          .maybeSingle();

        if (error) {
          console.warn('[useBookBlurb] Cache lookup error:', error);
        } else if (cached) {
          if (cached.status === 'ready' && cached.blurb && cached.blurb.trim().length > 0) {
            setBlurb(cached.blurb);
            setStatus('ready');
            setLoading(false);
            return; // Cache hit, on s'arrête là
          } else if (cached.status === 'no_data') {
            setBlurb(null);
            setStatus('no_data');
            setLoading(false);
            return; // Pas de données, on s'arrête là
          }
        }

        // Pas de cache valide, on affiche le fallback immédiatement
        setLoading(false);
        setStatus(null);

        // 2) En arrière-plan, déclencher la génération
        (async () => {
          try {
            const { data, error: invokeError } = await supabase.functions.invoke('book_blurb_v1', {
              body: {
                book_key: bookKey,
                isbn: book.isbn || null,
                title: book.title || null,
                author: book.author || null,
                language: 'fr',
                force: false,
              },
            });

            if (invokeError) {
              console.warn('[useBookBlurb] Edge function error:', invokeError);
              return;
            }

            if (data?.ok) {
              if (data.status === 'no_data') {
                setStatus('no_data');
                return;
              }

              if (data.blurb && data.blurb.trim().length > 0) {
                setBlurb(data.blurb);
                setStatus('ready');
              }
            }
          } catch (error) {
            console.warn('[useBookBlurb] Exception calling edge function:', error);
            // Erreur silencieuse, pas de throw
          }
        })();
      } catch (error) {
        console.warn('[useBookBlurb] Exception:', error);
        setLoading(false);
        setStatus(null);
      }
    })();
  }, [book?.book_key, book?.isbn, book?.id]);

  return { blurb, loading, status };
}

