import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { X } from 'lucide-react';
import { BookCover } from './BookCover';
import { BookSocial } from './BookSocial';
import { supabase } from '../lib/supabase';
import { getTranslatedDescription } from '../lib/translate';
import { generateFallbackSummary } from '../services/openLibrary';
import { getCurrentLang } from '../lib/appLanguage';

interface BookDetailsModalProps {
  book: any;
  onClose: () => void;
  onAddToLibrary?: (book: any) => void;
  showAddButton?: boolean;
  initialTab?: 'summary' | 'comments';
  focusComment?: boolean;
}

export function BookDetailsModal({ 
  book, 
  onClose, 
  onAddToLibrary, 
  showAddButton = false,
  initialTab = 'summary',
  focusComment = false,
}: BookDetailsModalProps) {
  const { t } = useTranslation();
  const commentsSectionRef = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  // Log book object when modal opens
  useEffect(() => {
    console.log('[BookDetailsModal] book:', book);
  }, [book]);

  // Load summary from book_summaries using current language (not hardcoded 'fr')
  useEffect(() => {
    if (!book) {
      setSummary(null);
      return;
    }

    setLoadingSummary(true);
    (async () => {
      try {
        // Get current language (normalized to 'fr' or 'en')
        const currentLang = getCurrentLang();
        console.debug('[BookDetailsModal] Loading summary - currentLang:', currentLang, 'i18n.resolvedLanguage:', i18n.resolvedLanguage, 'i18n.language:', i18n.language);

        // Build book_key according to convention: isbn:${isbn} or uuid:${id}
        let bookKey: string | null = null;
        if (book.isbn) {
          const cleanIsbn = String(book.isbn).replace(/[-\s]/g, '');
          if (cleanIsbn.length >= 10) {
            bookKey = `isbn:${cleanIsbn}`;
          }
        }
        if (!bookKey && book.id) {
          bookKey = `uuid:${book.id}`;
        }

        if (!bookKey) {
          console.debug('[BookDetailsModal] No bookKey found, skipping summary query');
          setLoadingSummary(false);
          return;
        }

        // Query book_summaries: source='isbn' or 'uuid', source_id=isbn or id, lang=currentLang (not hardcoded 'fr')
        const source = book.isbn ? 'isbn' : 'uuid';
        const sourceId = book.isbn ? String(book.isbn).replace(/[-\s]/g, '') : book.id;

        const { data: summaryData, error: summaryError } = await supabase
          .from('book_summaries')
          .select('summary, lang')
          .eq('source', source)
          .eq('source_id', sourceId)
          .eq('lang', currentLang) // Use normalized current language ('fr' or 'en')
          .maybeSingle();

        if (summaryError) {
          console.error('[BookDetailsModal] Error loading summary:', {
            error: summaryError,
            message: summaryError.message,
            code: summaryError.code,
            details: summaryError.details,
            hint: summaryError.hint,
            source,
            sourceId,
            lang: currentLang,
          });
          setLoadingSummary(false);
          return;
        }

        if (summaryData?.summary) {
          console.debug('[BookDetailsModal] Summary found - lang:', summaryData.lang, 'summary length:', summaryData.summary.length);
          setSummary(summaryData.summary);
          setLoadingSummary(false);
          return;
        }

        // No summary found in current language
        console.debug('[BookDetailsModal] No summary found for lang:', currentLang, 'source:', source, 'sourceId:', sourceId);
        setSummary(null);
        setLoadingSummary(false);
      } catch (error) {
        console.error('[BookDetailsModal] Unexpected error loading summary:', error);
        setLoadingSummary(false);
      }
    })();
  }, [book?.id, book?.isbn, i18n.resolvedLanguage]); // Re-run when book or language changes

  // Load and translate description (re-runs when language changes)
  useEffect(() => {
    if (!book) {
      setTranslatedDescription(null);
      return;
    }

    const loadTranslatedDescription = async () => {
      setTranslating(true);
      try {
        // Get current language (normalized 'fr' or 'en')
        const currentLang = getCurrentLang();
        console.debug('[BookDetailsModal] Loading translated description - currentLang:', currentLang);

        // Priority 1: summary from book_summaries (already in correct language from query)
        if (summary) {
          // ⚠️ detectLanguage est peu fiable, on laisse getTranslatedDescription gérer
          // Elle vérifiera le cache et traduira si nécessaire
          console.debug('[BookDetailsModal] Summary found - translating to', currentLang);
          const translated = await getTranslatedDescription(book, summary, currentLang);
          setTranslatedDescription(translated);
          setTranslating(false);
          return;
        }

        // Priority 2: Try to get summary in other language as fallback, then translate
        if (book.isbn || book.id) {
          const source = book.isbn ? 'isbn' : 'uuid';
          const sourceId = book.isbn ? String(book.isbn).replace(/[-\s]/g, '') : book.id;
          const otherLang = currentLang === 'fr' ? 'en' : 'fr';
          
          const { data: otherSummaryData } = await supabase
            .from('book_summaries')
            .select('summary, lang')
            .eq('source', source)
            .eq('source_id', sourceId)
            .eq('lang', otherLang)
            .maybeSingle();
          
          if (otherSummaryData?.summary) {
            console.debug('[BookDetailsModal] Found summary in other lang:', otherSummaryData.lang, 'translating to', currentLang);
            const translated = await getTranslatedDescription(book, otherSummaryData.summary, currentLang);
            setTranslatedDescription(translated);
            setTranslating(false);
            return;
          }
        }

        // Priority 3: description from books table
        if (book.description && book.description.trim().length > 0) {
          console.debug('[BookDetailsModal] Using book.description, translating to', currentLang);
          const translated = await getTranslatedDescription(book, book.description.trim(), currentLang);
          setTranslatedDescription(translated);
          setTranslating(false);
          return;
        }

        // Priority 4: Generate fallback summary in current language
        console.debug('[BookDetailsModal] No summary/description found, generating fallback');
        const fallback = generateFallbackSummary({
          title: book.title,
          author: book.author,
          total_pages: book.total_pages,
          category: book.genre,
          genre: book.genre,
        });
        setTranslatedDescription(fallback);
        setTranslating(false);
      } catch (error) {
        console.error('[BookDetailsModal] Error translating description:', error);
        setTranslatedDescription(null);
        setTranslating(false);
      }
    };

    loadTranslatedDescription();
  }, [book, summary, i18n.resolvedLanguage]); // Re-run when book, summary, or language changes

  // Determine display description: translated description or fallback
  const displayDescription = translatedDescription;

  // Scroll to comments section if initialTab is 'comments'
  useEffect(() => {
    if (initialTab === 'comments' && commentsSectionRef.current) {
      setTimeout(() => {
        commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [initialTab]);

  // Appel Edge Function en arrière-plan (silencieux, ne modifie pas l'UI)
  useEffect(() => {
    const source = book.google_books_id ? 'google' : book.openLibraryKey ? 'openlibrary' : 'unknown';
    const sourceId = book.id || book.google_books_id || book.openLibraryKey || null;
    const lang =
      typeof navigator !== 'undefined' &&
      typeof navigator.language === 'string' &&
      navigator.language.toLowerCase().startsWith('fr')
        ? 'fr'
        : 'en';

    // Si pas d'ID source ou titre, ne rien faire
    if (!sourceId || !book.title) return;

    // Appel silencieux en arrière-plan (pour préchauffer le cache DB, mais sans bloquer l'UI)
    supabase.functions.invoke('book-summary', {
      body: {
        source,
        source_id: sourceId,
        title: book.title || '',
        authors: book.author || book.authors || '',
        description: book.description || '',
        categories: book.genre || book.category || '',
        pageCount: book.total_pages || book.pageCount || undefined,
        publishedDate: book.publishedDate || book.published_year || undefined,
        lang,
      },
    }).catch(() => {
      // Ignore silencieusement les erreurs
    });
  }, [book.id, book.title]);
  return (
    <div 
      className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4" 
      onClick={onClose}
    >
      <div
        className="bg-background-light rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <div className="sticky top-0 bg-background-light/95 backdrop-blur-sm z-10 px-6 pt-4 pb-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-text-main-light">{t('book.details')}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5 text-text-sub-light" />
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="flex gap-4 mb-6 items-start">
            <div className="w-20 h-28 shrink-0">
              <BookCover
                coverUrl={book.cover_url}
                title={book.title}
                author={book.author || 'Auteur inconnu'}
                className="w-full h-full rounded-lg overflow-hidden shadow-sm border border-gray-200"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-bold text-text-main-light mb-2 leading-tight">
                {book.title}
              </h3>
              <p className="text-lg text-text-sub-light font-medium mb-3">
                {book.author}
              </p>

              <div className="flex flex-wrap gap-2">
                {book.genre && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {book.genre}
                  </span>
                )}
                {book.total_pages ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                    {book.total_pages} {t('book.pages')}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                    {t('book.unknownPages')}
                  </span>
                )}
                {book.edition && book.edition !== 'Standard Edition' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                    {book.edition}
                  </span>
                )}
              </div>
            </div>
          </div>

          {(book.publisher || book.isbn) && (
            <div className="mb-6 px-4 py-3 bg-gray-50 rounded-xl">
              <div className="space-y-1">
                {book.publisher && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-text-sub-light min-w-[70px]">Éditeur:</span>
                    <span className="text-xs text-text-main-light font-medium">{book.publisher}</span>
                  </div>
                )}
                {book.isbn && (
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-text-sub-light min-w-[70px]">ISBN:</span>
                    <span className="text-xs text-text-main-light font-medium">{book.isbn}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-6">
            <h4 className="text-sm font-bold text-text-main-light mb-3 uppercase tracking-wide">
              {t('book.summary')}
            </h4>
            {loadingSummary || translating ? (
              <p className="text-sm text-black/50 italic">
                {translating ? t('book.translating') : t('common.loading')}
              </p>
            ) : displayDescription && displayDescription.trim().length > 0 ? (
              <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line line-clamp-6">
                {displayDescription}
              </p>
            ) : (
              <p className="text-sm text-black/50 italic">{t('book.summaryUnavailable')}</p>
            )}
          </div>

          {/* Section sociale : likes et commentaires */}
          <div ref={commentsSectionRef}>
            <BookSocial book={book} focusComment={focusComment} />
          </div>

          {showAddButton && onAddToLibrary && (
            <button
              onClick={() => onAddToLibrary(book)}
              className="w-full bg-primary text-black py-4 rounded-xl font-bold hover:brightness-95 transition-all shadow-sm"
            >
              {t('book.addToLibrary')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
