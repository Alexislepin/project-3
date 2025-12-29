import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { X, Sparkles } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { BookCover } from './BookCover';
import { BookSocial } from './BookSocial';
import { AddCoverModal } from './AddCoverModal';
import { supabase } from '../lib/supabase';
import { getTranslatedDescription } from '../lib/translate';
import { generateFallbackSummary } from '../services/openLibrary';
import { getCurrentLang } from '../lib/appLanguage';
import { LibraryAIModal } from './LibraryAIModal';
import { canonicalBookKey } from '../lib/bookSocial';
import { useAuth } from '../contexts/AuthContext';
import { useBookBlurb } from '../hooks/useBookBlurb';

interface BookDetailsModalProps {
  book: any;
  onClose: () => void;
  onAddToLibrary?: (book: any) => void;
  showAddButton?: boolean;
  showAiButton?: boolean; // Show/hide AI button (default: true, false for Explorer context)
  initialTab?: 'summary' | 'comments';
  focusComment?: boolean;
  userBookId?: string; // For edit functionality
  currentPage?: number; // For recap functionality
  onEditRequested?: () => void; // Callback to open EditBookModal
  onOpenRecap?: () => void; // Callback to open BookRecapModal
}

export function BookDetailsModal({ 
  book, 
  onClose, 
  onAddToLibrary, 
  showAddButton = false,
  showAiButton = true, // Default: show AI button, hide for Explorer context
  initialTab = 'summary',
  focusComment = false,
  userBookId,
  currentPage,
  onEditRequested,
  onOpenRecap,
}: BookDetailsModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const commentsSectionRef = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [translatedDescription, setTranslatedDescription] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [userBook, setUserBook] = useState<any>(null);
  const [showAddCover, setShowAddCover] = useState(false);
  
  // Hook pour le blurb (résumé court instantané)
  const { blurb, loading: loadingBlurb, status: blurbStatus } = useBookBlurb(book);

  // Log book object when modal opens
  useEffect(() => {
    console.log('[BookDetailsModal] book:', book);
  }, [book]);

  // Load user_book to get current_page and custom_cover_url
  useEffect(() => {
    if (!user || !book?.id) return;

    (async () => {
      const { data } = await supabase
        .from('user_books')
        .select('current_page, custom_cover_url')
        .eq('user_id', user.id)
        .eq('book_id', book.id)
        .maybeSingle();

      if (data) {
        setUserBook(data);
      }
    })();
  }, [user, book?.id]);

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

  // Lock scroll when modal is open
  useScrollLock(true);

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
      data-modal-overlay
      onClick={onClose}
      onTouchMove={(e) => {
        // Prevent scroll on overlay
        const target = e.target as HTMLElement;
        if (!target.closest('[data-modal-content]')) {
          e.preventDefault();
        }
      }}
    >
      <div
        data-modal-content
        className="bg-background-light rounded-3xl w-full max-w-lg flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxHeight: '85vh'
        }}
      >
        <div className="sticky top-0 bg-background-light z-10 px-6 pt-4 pb-3 border-b border-gray-200">
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

        <div 
          className="flex-1 overflow-y-auto min-h-0 px-6 py-6" 
          style={{ 
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)'
          }}
        >
          <div className="flex gap-4 mb-6 items-start">
            <div className="w-20 h-28 shrink-0">
              <BookCover
                custom_cover_url={userBook?.custom_cover_url || null}
                coverUrl={book.cover_url || null}
                title={book.title}
                author={book.author || 'Auteur inconnu'}
                isbn={book.isbn || null}
                isbn13={book.isbn13 || null}
                isbn10={book.isbn10 || null}
                cover_i={book.openlibrary_cover_id || null}
                openlibrary_cover_id={book.openlibrary_cover_id || null}
                googleCoverUrl={book.google_books_id ? `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : null}
                className="w-full h-full rounded-lg overflow-hidden shadow-sm border border-gray-200"
                bookId={book.id}
                showAddCoverButton={!!user && !!userBook && !userBook.custom_cover_url}
                onAddCover={() => setShowAddCover(true)}
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
            {/* Priorité 1: Blurb (résumé court généré) */}
            {blurb && blurb.trim().length > 0 ? (
              <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line line-clamp-6">
                {blurb}
              </p>
            ) : loadingSummary || translating || loadingBlurb ? (
              <p className="text-sm text-black/50 italic">
                {translating ? t('book.translating') : t('common.loading')}
              </p>
            ) : displayDescription && displayDescription.trim().length > 0 ? (
              /* Priorité 2: Description source traduite existante (fallback) */
              <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line line-clamp-6">
                {displayDescription}
              </p>
            ) : (
              /* Priorité 3: Placeholder */
              <p className="text-sm text-black/50 italic">{t('book.summaryUnavailable')}</p>
            )}
          </div>

          {/* Section sociale : likes et commentaires */}
          <div ref={commentsSectionRef}>
            <BookSocial book={book} focusComment={focusComment} />
          </div>

          {/* Bouton Voir sur Lireka (si pages ou cover manquants) */}
          {(!book.total_pages || !book.cover_url) && book.isbn && (
            <button
              onClick={() => {
                const cleanIsbn = String(book.isbn).replace(/[-\s]/g, '');
                const lirekaUrl = `https://www.lireka.com/fr/search?query=${cleanIsbn}`;
                window.open(lirekaUrl, '_blank');
              }}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:brightness-95 transition-all shadow-sm flex items-center justify-center gap-2 mb-3 text-sm"
            >
              <span>Voir sur Lireka</span>
            </button>
          )}

          {/* Bouton Rappel IA - Only show if showAiButton is true and not using onOpenRecap */}
          {showAiButton && !onOpenRecap && (
            <button
              onClick={() => {
                setShowAIModal(true);
              }}
              className="w-full bg-stone-900 text-white py-4 rounded-xl font-semibold hover:brightness-95 transition-all shadow-sm mb-3"
            >
              IA
            </button>
          )}

          {showAddButton && onAddToLibrary && (
            <button
              onClick={() => onAddToLibrary(book)}
              className="w-full bg-primary text-black py-4 rounded-xl font-bold hover:brightness-95 transition-all shadow-sm"
            >
              {t('book.addToLibrary')}
            </button>
          )}
        </div>

        {/* Footer with actions */}
        {(userBookId || onOpenRecap) && (
          <div className="sticky bottom-0 bg-background-light border-t border-gray-200 rounded-b-3xl flex-shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10">
            <div 
              className="px-6 py-3 flex gap-3"
              style={{ 
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)'
              }}
            >
              {userBookId && onEditRequested && (
                <button
                  onClick={onEditRequested}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  Modifier
                </button>
              )}
              {onOpenRecap && (
                <button
                  onClick={onOpenRecap}
                  className="flex-1 py-3 px-4 bg-stone-900 text-white rounded-xl font-semibold hover:brightness-95 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  IA
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showAIModal && (
        <LibraryAIModal
          onClose={() => setShowAIModal(false)}
          bookKey={canonicalBookKey(book)}
          bookTitle={book.title}
          bookAuthor={book.author}
          currentPage={userBook?.current_page || undefined}
          totalPages={book.total_pages || undefined}
        />
      )}

      {showAddCover && user && book.id && (
        <AddCoverModal
          open={showAddCover}
          bookId={book.id}
          bookTitle={book.title}
          onClose={() => setShowAddCover(false)}
          onUploaded={async (newUrl) => {
            // Reload userBook to refresh custom cover
            const { data } = await supabase
              .from('user_books')
              .select('current_page, custom_cover_url')
              .eq('user_id', user.id)
              .eq('book_id', book.id)
              .maybeSingle();
            
            if (data) {
              setUserBook(data);
            }
            setShowAddCover(false);
          }}
        />
      )}
    </div>
  );
}
