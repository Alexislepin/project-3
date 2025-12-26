import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { BookCover } from './BookCover';
import { BookSocial } from './BookSocial';
import { supabase } from '../lib/supabase';

interface BookDetailsModalProps {
  book: any;
  onClose: () => void;
  onAddToLibrary?: (book: any) => void;
  showAddButton?: boolean;
  initialTab?: 'summary' | 'comments';
  focusComment?: boolean;
}

// Résumé rapide fixe (2 lignes) en français, instantané
function buildQuickSummary(book: any): string {
  const pages = book.total_pages || book.pageCount;
  const hasGenre = !!(book.genre || book.category);
  const kind = hasGenre ? 'Roman' : 'Livre';
  const pagesText = pages ? `${pages} pages` : 'Pages inconnues';

  const line1 = `${kind} • ${pagesText}`;
  const line2 = 'Aperçu : résumé non détaillé disponible';
  return `${line1}\n${line2}`;
}

export function BookDetailsModal({ 
  book, 
  onClose, 
  onAddToLibrary, 
  showAddButton = false,
  initialTab = 'summary',
  focusComment = false,
}: BookDetailsModalProps) {
  const commentsSectionRef = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  // Helper: Check if string is a valid UUID
  const isUuid = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // Log book object when modal opens
  useEffect(() => {
    console.log('[BookDetailsModal] book:', book);
  }, [book]);

  // Load summary from book_summaries using book_key convention
  useEffect(() => {
    if (!book) {
      setSummary(null);
      return;
    }

    setLoadingSummary(true);
    (async () => {
      try {
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
          setLoadingSummary(false);
          return;
        }

        // Query book_summaries: source='isbn' or 'uuid', source_id=isbn or id, lang='fr'
        const source = book.isbn ? 'isbn' : 'uuid';
        const sourceId = book.isbn ? String(book.isbn).replace(/[-\s]/g, '') : book.id;

        const { data: summaryData, error: summaryError } = await supabase
          .from('book_summaries')
          .select('summary')
          .eq('source', source)
          .eq('source_id', sourceId)
          .eq('lang', 'fr')
          .maybeSingle();

        if (summaryError) {
          console.error('[BookDetailsModal] Error loading summary:', summaryError);
          setLoadingSummary(false);
          return;
        }

        if (summaryData?.summary) {
          setSummary(summaryData.summary);
          setLoadingSummary(false);
          return;
        }

        // No summary found
        setSummary(null);
        setLoadingSummary(false);
      } catch (error) {
        console.error('[BookDetailsModal] Unexpected error loading summary:', error);
        setLoadingSummary(false);
      }
    })();
  }, [book?.id, book?.isbn]);

  // Determine display description
  const displayDescription = summary || 'Résumé indisponible';

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
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-end" onClick={onClose}>
      <div
        className="bg-background-light rounded-t-3xl w-full max-w-lg mx-auto max-h-[85vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background-light/95 backdrop-blur-sm z-10 px-6 pt-4 pb-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-text-main-light">Détails du livre</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Fermer"
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
                    {book.total_pages} pages
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                    Pages inconnues
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

          {(displayDescription || loadingSummary) && (
            <div className="mb-6">
              <h4 className="text-sm font-bold text-text-main-light mb-3 uppercase tracking-wide">
                Résumé
              </h4>
              {loadingSummary ? (
                <p className="text-sm text-black/50 italic">Chargement du résumé...</p>
              ) : displayDescription ? (
                <p className="text-sm text-black/70 leading-relaxed whitespace-pre-line">
                  {displayDescription}
                </p>
              ) : (
                <p className="text-sm text-black/50 italic">Résumé indisponible</p>
              )}
            </div>
          )}

          {/* Section sociale : likes et commentaires */}
          <div ref={commentsSectionRef}>
            <BookSocial book={book} focusComment={focusComment} />
          </div>

          {showAddButton && onAddToLibrary && (
            <button
              onClick={() => onAddToLibrary(book)}
              className="w-full bg-primary text-black py-4 rounded-xl font-bold hover:brightness-95 transition-all shadow-sm"
            >
              Ajouter à ma bibliothèque
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
