import { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Book, Search as SearchIcon, TrendingUp, Scan, MoreVertical, Plus, Sparkles, RefreshCw, Heart, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BookDetailsWithManagement } from '../components/BookDetailsWithManagement';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { AddBookStatusModal } from '../components/AddBookStatusModal';
import { ManageBookModal } from '../components/ManageBookModal';
import { EditBookModal } from '../components/EditBookModal';
import { AddManualBookModal } from '../components/AddManualBookModal';
import { BookCover } from '../components/BookCover';
import { AddCoverModal } from '../components/AddCoverModal';
import { Toast } from '../components/Toast';
import { debugLog, debugWarn, fatalError } from '../utils/logger';
import { searchBookByISBN, searchBooks as searchGoogleBooks, Book as GoogleBook } from '../lib/googleBooks';
import { fetchByIsbn as fetchOpenLibraryByIsbn, searchBooks as searchOpenLibraryBooks, fetchEditionByIsbn, fetchPagesFromBooksApi, fetchCoverUrlWithFallback } from '../services/openLibrary';
import { ensureBookInDB } from '../lib/booksUpsert';
import { getTranslatedDescription } from '../lib/translate';
import { useTranslation } from 'react-i18next';
import { useSwipeTabs } from '../lib/useSwipeTabs';
import { AppHeader } from '../components/AppHeader';
import { getBookSocialCounts, normalizeBookKey, canonicalBookKey, candidateBookKeysFromBook, type BookSocialCounts } from '../lib/bookSocial';
import { createBookEvent } from '../lib/bookEvents';
import { CommunityBookCard } from '../components/CommunityBookCard';
import { SearchResultCard } from '../components/SearchResultCard';
import { BookLikersModal } from '../components/BookLikersModal';
import { useCommunityFeed } from '../hooks/useCommunityFeed';
import { useExplorerSearch } from '../hooks/useExplorerSearch';
import { BookRecapModal } from '../components/BookRecapModal';
import { ReadingSetupModal } from '../components/ReadingSetupModal';
import { normalizeReadingState } from '../lib/readingState';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';
import { RecapUIState, DEFAULT_RECAP_UI } from '../lib/recapUI';

type BookStatus = 'reading' | 'completed' | 'want_to_read';
type FilterType = BookStatus | 'explore' | 'all';

type UiBook = GoogleBook & {
  openLibraryKey?: string;
};


interface LibraryProps {
  onNavigateToSearch?: () => void;
  showScanner?: boolean;
  onCloseScanner?: () => void;
  onOpenScanner?: () => void;
}

export function Library({ onNavigateToSearch, showScanner: externalShowScanner, onCloseScanner, onOpenScanner }: LibraryProps) {
  const { t } = useTranslation();
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('reading');
  const [loading, setLoading] = useState(true);
  const [detailsBookId, setDetailsBookId] = useState<string | null>(null);
  const { user } = useAuth();
  
  // Explorer hooks (community feed + search) - must be after useAuth()
  const communityFeed = useCommunityFeed(user?.id);
  const explorerSearch = useExplorerSearch();
  
  // Social counts for explore tab (merged from community feed)
  const [librarySocialCounts, setLibrarySocialCounts] = useState<BookSocialCounts>({});
  const [enrichDisabled, setEnrichDisabled] = useState(false); // Circuit breaker pour éviter le spam d'enrichissement
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GoogleBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [booksInLibrary, setBooksInLibrary] = useState<Set<string>>(new Set()); // Track books already in library (by book_id or isbn)
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [internalShowScanner, setInternalShowScanner] = useState(false);
  const showScanner = externalShowScanner !== undefined ? externalShowScanner : internalShowScanner;
  const setShowScanner = (value: boolean) => {
    if (externalShowScanner !== undefined) {
      // Si le scanner est contrôlé depuis l'extérieur, utiliser les callbacks
      if (value && onOpenScanner) {
        onOpenScanner();
      } else if (!value && onCloseScanner) {
        onCloseScanner();
      }
    } else {
      // Sinon, utiliser le state interne
      setInternalShowScanner(value);
    }
  };

  // Écouter l'event global pour ouvrir le scanner depuis BottomNav
  useEffect(() => {
    const handleOpenScanner = () => {
      if (externalShowScanner !== undefined && onOpenScanner) {
        // Si le scanner est contrôlé depuis l'extérieur, utiliser le callback
        onOpenScanner();
      } else if (externalShowScanner === undefined) {
        // Sinon, utiliser le state interne
        setInternalShowScanner(true);
      }
    };
    window.addEventListener("lexu:open-scanner", handleOpenScanner as any);
    return () => window.removeEventListener("lexu:open-scanner", handleOpenScanner as any);
  }, [externalShowScanner, onOpenScanner]);
  const [bookToAdd, setBookToAdd] = useState<GoogleBook | null>(null);
  const [bookToManage, setBookToManage] = useState<any>(null);
  const [bookToEdit, setBookToEdit] = useState<any>(null);
  const [showReadingSetup, setShowReadingSetup] = useState(false);
  const [pendingBookAdd, setPendingBookAdd] = useState<{ 
    book: GoogleBook | UiBook; 
    status: BookStatus;
    totalPages?: number | null;
  } | null>(null);
  const [selectedBookDetails, setSelectedBookDetails] = useState<GoogleBook | null>(null);
  const [selectedBookForComments, setSelectedBookForComments] = useState<GoogleBook | null>(null);
  const [selectedDbBook, setSelectedDbBook] = useState<any>(null); // For Explorer tab: DB book data
  const [loadingSelected, setLoadingSelected] = useState(false); // Loading state for Explorer details
  const [likedByBookKey, setLikedByBookKey] = useState<string | null>(null); // For BookLikersModal
  const [likedByTitle, setLikedByTitle] = useState<string>(''); // Book title for BookLikersModal
  
  // Hardening: in-flight locks and throttle for toggle like
  const likeInFlightRef = useRef<Set<string>>(new Set());
  const lastLikeTapRef = useRef<Map<string, number>>(new Map());
  const [likingBookKeys, setLikingBookKeys] = useState<Set<string>>(new Set()); // State to trigger re-renders
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapBook, setRecapBook] = useState<{
    book: { id: string; title: string; author?: string; cover_url?: string | null; total_pages?: number | null; book_key?: string | null; isbn?: string | null; openlibrary_key?: string | null; google_books_id?: string | null };
    uptoPage: number;
  } | null>(null);
  // ✅ États pour BookRecapModal
  const [recapUI, setRecapUI] = useState<RecapUIState>(DEFAULT_RECAP_UI);
  const [recapTabTouched, setRecapTabTouched] = useState(false);
  const recapReqRef = useRef<string | null>(null);
  const [addCoverBookId, setAddCoverBookId] = useState<string | null>(null);
  const [addCoverBookTitle, setAddCoverBookTitle] = useState<string>('');
  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [searchBarHeight, setSearchBarHeight] = useState(0);
  const [headerH, setHeaderH] = useState(56);
  const searchTimeoutRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ Calculer si un modal est ouvert (pour désactiver la tabbar)
  const anyModalOpen = Boolean(
    detailsBookId ||
    showScanner ||
    loadingSelected ||
    selectedDbBook ||
    selectedBookDetails ||
    selectedBookForComments ||
    bookToAdd ||
    bookToManage ||
    showManualAdd ||
    bookToEdit ||
    recapOpen ||
    showReadingSetup ||
    addCoverBookId
  );

  // ✅ Synchroniser document.body.dataset.modalOpen pour BottomNav
  useEffect(() => {
    if (anyModalOpen) {
      document.body.dataset.modalOpen = '1';
    } else {
      document.body.dataset.modalOpen = '0';
    }
    // Cleanup au unmount
    return () => {
      document.body.dataset.modalOpen = '0';
    };
  }, [anyModalOpen]);

  // Swipe horizontal entre tabs
  const tabs = ['all', 'reading', 'want_to_read', 'completed', 'explore'] as FilterType[];
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const ignoreAboveY = headerH + searchBarHeight; // Header mesuré + search bar
  
  useSwipeTabs({
    tabs,
    currentTab: filter,
    onTabChange: (tab) => setFilter(tab as FilterType),
    threshold: 60, // Plus strict
    verticalThreshold: 2.2, // Plus strict
    containerRef: scrollContainerRef,
    ignoreAboveY,
  });

  // Listen to global book-social-counts-changed event from BookSocial
  // This ensures Explorer cards AND Library cards update instantly when likes/comments change
  useEffect(() => {
    const handleCountsChanged = (event: CustomEvent) => {
      const { bookKey, likes, comments, isLiked } = event.detail;
      if (bookKey && typeof likes === 'number' && typeof comments === 'number') {
        // Update community feed social counts
        communityFeed.updateSocialCounts(bookKey, {
          likes,
          comments,
          isLiked: isLiked ?? false,
        });
        // Also update library social counts
        setLibrarySocialCounts((prev) => ({
          ...prev,
          [bookKey]: {
            likes,
            comments,
            isLiked: isLiked ?? false,
          },
        }));
      }
    };

    window.addEventListener('book-social-counts-changed', handleCountsChanged as EventListener);
    return () => {
      window.removeEventListener('book-social-counts-changed', handleCountsChanged as EventListener);
    };
  }, [communityFeed]);

  // Load community feed when Explorer tab is active and no search query
  useEffect(() => {
    if (!user) return;

    if (filter === 'explore') {
      // CRITICAL: Community feed and search are mutually exclusive
      // Only load community feed if search query is empty (or < 2 chars)
      if (!explorerSearch.query || explorerSearch.query.trim().length < 2) {
        if (communityFeed.books.length === 0 && !communityFeed.loading) {
          communityFeed.refresh();
        }
      } else {
        // If user is searching, clear community feed visibility (but keep data)
        explorerSearch.search(explorerSearch.query);
      }
      loadBooksInLibrary(); // Load books in library when switching to explore
    } else {
      if (filter === 'all') {
        loadUserBooks('all');
      } else {
        loadUserBooks(filter as BookStatus);
      }
    }
  }, [filter, user, explorerSearch.query]);

  // Load books in library when component mounts or user changes (for explore tab)
  useEffect(() => {
    if (user && filter === 'explore') {
      loadBooksInLibrary();
    }
  }, [user]);

  // Infinite scroll for Community feed
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (filter !== 'explore') return;
    if (explorerSearch.query && explorerSearch.query.trim().length >= 2) return; // Don't load more if searching
    if (!communityFeed.hasMore || communityFeed.loading) return;

    const el = loadMoreRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && !communityFeed.loading) {
          communityFeed.loadMore();
        }
      },
      { root: null, rootMargin: "300px", threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [filter, communityFeed.hasMore, communityFeed.loading, communityFeed.books.length, explorerSearch.query]);


  const loadUserBooks = async (statusOverride?: BookStatus | 'all') => {
    if (!user) return;

    setLoading(true);

    const statusToLoad: BookStatus | 'all' =
      statusOverride ?? (filter === 'explore' ? 'reading' : filter === 'all' ? 'all' : (filter as BookStatus));

    let q = supabase
      .from('user_books')
      .select(`
        id,
        status,
        current_page,
        book_id,
        created_at,
        updated_at,
        custom_title,
        custom_author,
        custom_total_pages,
        custom_cover_url,
        custom_description,
        book:books (
          id,
          book_key,
          openlibrary_work_key,
          title,
          author,
          total_pages,
          cover_url,
          description,
          isbn,
          google_books_id,
          edition,
          openlibrary_cover_id
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (statusToLoad !== 'all') {
      q = q.eq('status', statusToLoad);
    }

    const { data, error, status } = await q;

    // Debug: log what we actually got back
    console.log('[loadUserBooks] result', {
      userId: user.id,
      statusToLoad,
      rowCount: data?.length ?? 0,
      error,
      status,
    });

    // Extra debug: what statuses exist in DB for this user?
    try {
      const { data: statusRows, error: statusError } = await supabase
        .from('user_books')
        .select('status')
        .eq('user_id', user.id);

      console.log('[loadUserBooks] status distribution', {
        userId: user.id,
        statuses: statusRows?.map((r: any) => r.status) ?? [],
        statusError,
      });
    } catch (debugErr) {
      console.error('[loadUserBooks] debug status query failed', debugErr);
    }

    if (error) {
      console.error('[loadUserBooks] SUPABASE ERROR', {
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        status,
      });
      setToast({
        message: `Erreur chargement livres: ${error.message} (${(error as any).code ?? 'no code'})`,
        type: 'error',
      });
      fatalError('USER_BOOKS ERROR (Library):', error);
    }

    // ✅ SEULE SOURCE DE VÉRITÉ : Calculer is_liked depuis book_likes
    let enrichedData = data;
    if (data && data.length > 0 && user?.id) {
      try {
        // 1) Récupérer tous les book_keys des livres
        const bookKeys = data
          .map((userBook: any) => {
            const book = userBook.book;
            if (!book) return null;
            return book.book_key;
          })
          .filter((key): key is string => !!key && key !== 'unknown');

        if (bookKeys.length > 0) {
          // 2) Charger TOUS les likes actifs de l'utilisateur pour ces livres
          const candidateKeysSet = new Set<string>();
          bookKeys.forEach(key => {
            const candidates = candidateBookKeysFromBook(key);
            candidates.forEach(c => candidateKeysSet.add(c));
          });

          const { data: likesData } = await supabase
            .from('book_likes')
            .select('book_key')
            .eq('user_id', user.id)
            .in('book_key', Array.from(candidateKeysSet))
            .is('deleted_at', null);

          // 3) Créer un Set des book_keys likés (normalisés)
          const likedKeysSet = new Set<string>();
          (likesData || []).forEach(like => {
            const normalized = canonicalBookKey({ book_key: like.book_key }) || like.book_key;
            likedKeysSet.add(normalized);
            // Ajouter aussi les variantes
            candidateBookKeysFromBook(like.book_key).forEach(k => {
              const norm = canonicalBookKey({ book_key: k }) || k;
              likedKeysSet.add(norm);
            });
          });

          // 4) Enrichir chaque livre avec is_liked
          enrichedData = data.map((userBook: any) => {
            const book = userBook.book;
            if (!book) return userBook;
            const bk = canonicalBookKey(book) || book.book_key;
            const is_liked = bk ? likedKeysSet.has(bk) : false;
            return {
              ...userBook,
              book: {
                ...book,
                is_liked,
              },
            };
          });
        }
      } catch (error) {
        console.warn('Error loading is_liked:', error);
      }
    }

    // Debug logging for cover URLs
    if (enrichedData && enrichedData.length > 0) {
      enrichedData.forEach((row: any) => {
        const title = row.book?.title || 'Unknown';
        const custom_cover_url = row.custom_cover_url || null;
        const book_cover_url = row.book?.cover_url || null;
        console.log('[Library] cover debug', { title, custom_cover_url, book_cover_url });
      });
    }

    // Fallback robuste: si des books sont null, les récupérer en batch
    if (enrichedData && enrichedData.length > 0) {
      const missingBooks = enrichedData.filter(r => !r.book && r.book_id);
      
      if (missingBooks.length > 0) {
        debugWarn(`${missingBooks.length} books missing from join, fetching separately...`);
        const bookIds = missingBooks.map(r => r.book_id);
        
        const { data: booksData, error: booksError } = await supabase
          .from('books')
          .select('id, title, author, cover_url, total_pages, description, isbn, google_books_id, edition')
          .in('id', bookIds);

        if (booksError) {
          fatalError('Error fetching missing books:', booksError);
        } else if (booksData) {
          // Créer un map pour lookup rapide
          const booksMap = new Map(booksData.map(b => [b.id, b]));
          
          // Remplacer les books null par les données récupérées (en préservant is_liked)
          const finalEnrichedData = enrichedData.map(userBook => {
            if (!userBook.book && userBook.book_id && booksMap.has(userBook.book_id)) {
              return { ...userBook, book: booksMap.get(userBook.book_id) };
            }
            return userBook;
          });
          
          // Legacy backfill of cover_url removed: we now prefer Open Library cover IDs
          
          debugLog(`Enriched ${missingBooks.length} missing books`);
          setUserBooks(finalEnrichedData);
          setLoading(false);
          return;
        }
      }
      
      // Self-heal: enrichir les livres manquants avec Edge Function (throttle: max 3 simultanés)
      const booksToEnrich: Array<{ bookId: string; book: any }> = [];
      for (const userBook of enrichedData) {
        const book = userBook.book;
        if (book && typeof book === 'object' && !Array.isArray(book)) {
          const bookCoverUrl = (book as any).cover_url;
          const bookTotalPages = (book as any).total_pages;
          const bookDescription = (book as any).description;
          const bookId = (book as any).id;
          
          // Détecter descriptions "pauvres" (fallback basique)
          const isPoorDesc = !bookDescription || 
            bookDescription.trim().length < 120 ||
            /^Livre de .+ environ \d+ pages\.?$/i.test(bookDescription) ||
            /^Roman de .+ environ \d+ pages\.?$/i.test(bookDescription);
          
          // Collecter les livres qui ont besoin d'enrichissement
          if (bookId && (!bookCoverUrl || !bookTotalPages || isPoorDesc)) {
            booksToEnrich.push({ bookId, book });
          }
        }
      }
      
      // Lancer l'enrichissement en arrière-plan avec throttle (max 3 simultanés)
      // ✅ Désactiver en dev pour éviter le spam
      const isDev = import.meta.env.DEV;
      if (booksToEnrich.length > 0 && !isDev) {
        console.log(`[Self-Heal] Found ${booksToEnrich.length} books to enrich`);
        
        const CONCURRENCY_LIMIT = 3;
        let activeCount = 0;
        let index = 0;
        const inFlightLock = new Set<string>();
        const lastEnrichTime = new Map<string, number>();
        const ENRICH_COOLDOWN_MS = 60 * 1000; // 1 minute entre enrichissements du même livre
        
        const processNext = async () => {
          if (index >= booksToEnrich.length) return;
          
          const { bookId, book } = booksToEnrich[index++];
          
          // Vérifier le lock et le cooldown
          if (inFlightLock.has(bookId)) {
            if (index < booksToEnrich.length) processNext();
            return;
          }
          
          const lastTime = lastEnrichTime.get(bookId);
          if (lastTime && Date.now() - lastTime < ENRICH_COOLDOWN_MS) {
            if (index < booksToEnrich.length) processNext();
            return;
          }
          
          inFlightLock.add(bookId);
          activeCount++;
          lastEnrichTime.set(bookId, Date.now());
          
          try {
            // Circuit breaker: ne pas appeler si enrichDisabled
            if (enrichDisabled) {
              if (index < booksToEnrich.length) processNext();
              return;
            }

            // Appeler l'Edge Function
            const { data: result, error } = await supabase.functions.invoke('book_enrich_v1', {
              body: {
                bookId,
                isbn: book.isbn || book.isbn13 || book.isbn10 || null,
                googleBooksId: book.google_books_id || null,
                openlibraryWorkKey: book.openlibrary_work_key || null,
                openlibraryEditionKey: book.openlibrary_edition_key || null,
              },
            });
            
            if (error) {
              console.error(`[Self-Heal] Error invoking book_enrich_v1 for ${bookId}:`, error);
              const msg = String(error?.message || error);
              if (msg.includes("CORS") || msg.includes("Failed to send a request") || msg.includes("ERR_FAILED") || msg.includes("NetworkError")) {
                setEnrichDisabled(true);
                console.warn('[Self-Heal] Enrichissement désactivé (CORS/network error détecté). Reset automatique dans 2 min.');
                // Reset automatique après 2 min
                setTimeout(() => {
                  setEnrichDisabled(false);
                  console.log('[Self-Heal] Circuit breaker réinitialisé automatiquement');
                }, 120000); // 2 minutes
              } else {
                // Autres erreurs: reset après 2 min aussi
                setEnrichDisabled(true);
                setTimeout(() => {
                  setEnrichDisabled(false);
                  console.log('[Self-Heal] Circuit breaker réinitialisé automatiquement (erreur non-CORS)');
                }, 120000);
              }
            } else if (result?.ok && result.metadata) {
              const { metadata } = result;
              
              // Mettre à jour l'UI immédiatement
              setUserBooks((prev) =>
                prev.map((ub) => {
                  if (ub.book?.id === bookId) {
                    return {
                      ...ub,
                      book: {
                        ...ub.book,
                        cover_url: metadata.cover_url || ub.book.cover_url,
                        total_pages: metadata.total_pages || ub.book.total_pages,
                        description: metadata.description || ub.book.description,
                        openlibrary_cover_id: metadata.openlibrary_cover_id || ub.book.openlibrary_cover_id,
                        openlibrary_work_key: metadata.openlibrary_work_key || ub.book.openlibrary_work_key,
                        openlibrary_edition_key: metadata.openlibrary_edition_key || ub.book.openlibrary_edition_key,
                        google_books_id: metadata.google_books_id || ub.book.google_books_id,
                      },
                    };
                  }
                  return ub;
                })
              );
            }
          } catch (err) {
            console.error(`[Self-Heal] Error enriching book ${bookId}:`, err);
          } finally {
            inFlightLock.delete(bookId);
            activeCount--;
            if (index < booksToEnrich.length) {
              processNext();
            }
          }
        };
        
        // Lancer les premiers jobs
        for (let i = 0; i < Math.min(CONCURRENCY_LIMIT, booksToEnrich.length); i++) {
          processNext();
        }
      } else if (booksToEnrich.length > 0 && isDev) {
        console.log('[Self-Heal] DEV mode: auto-enrich disabled');
      }
      
      setUserBooks(enrichedData);
      
      // ✅ preload social counts pour la liste (sinon tu restes à 0)
      try {
        const keys = (enrichedData || [])
          .map((ub: any) => ub.book)
          .filter(Boolean)
          .map((b: any) => canonicalBookKey(b) || (b.book_key && normalizeBookKey(b.book_key)) || b.book_key)
          .filter((k: any): k is string => !!k && k !== 'unknown');

        const unique = Array.from(new Set(keys));
        if (unique.length > 0 && user?.id) {
          const counts = await getBookSocialCounts(unique, user.id);
          setLibrarySocialCounts(counts);
        }
      } catch (e) {
        console.warn('[Library] preload social counts failed', e);
      }
    } else {
      setUserBooks([]);
    }

    setLoading(false);
  };

  // Handle search query changes in Explorer tab
  useEffect(() => {
    if (filter !== 'explore') return;
    
    const trimmedQuery = searchQuery.trim();
    
    if (trimmedQuery.length >= 2) {
      // User is searching: trigger search and hide community feed
      explorerSearch.search(trimmedQuery);
    } else {
      // Query is too short or empty: clear search and show community feed
      explorerSearch.clear();
      if (trimmedQuery.length === 0 && communityFeed.books.length === 0 && !communityFeed.loading) {
        communityFeed.refresh();
      }
    }
  }, [searchQuery, filter]);

  const getProgress = (currentPage: number, totalPages: number | null) => {
    if (!totalPages || totalPages === 0) return 0;
    return Math.round((currentPage / totalPages) * 100);
  };

  // Load user's book IDs and ISBNs to check if books are already in library
  const loadBooksInLibrary = async () => {
    if (!user) return;

    const { data, error, status } = await supabase
      .from('user_books')
      .select('book_id, book:books(id, isbn, google_books_id)')
      .eq('user_id', user.id);

    if (error) {
      console.error('[loadBooksInLibrary] SUPABASE ERROR', {
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        status,
      });
      setToast({
        message: `Erreur chargement bibliothèque: ${error.message} (${(error as any).code ?? 'no code'})`,
        type: 'error',
      });
      fatalError('Error loading books in library:', error);
      return;
    }

    const bookIds = new Set<string>();
    if (data) {
      data.forEach((ub: any) => {
        if (ub.book_id) bookIds.add(ub.book_id);
        if (ub.book?.isbn) {
          const cleanIsbn = ub.book.isbn.replace(/[-\s]/g, '');
          bookIds.add(`isbn:${cleanIsbn}`);
        }
        if (ub.book?.google_books_id) {
          bookIds.add(`google:${ub.book.google_books_id}`);
        }
      });
    }

    setBooksInLibrary(bookIds);
  };

  // Check if a GoogleBook (or OpenLibrary book) is already in user's library
  const isBookInLibrary = (book: GoogleBook): boolean => {
    if (booksInLibrary.size === 0) return false;

    // Check by ISBN13 (preferred)
    if (book.isbn13) {
      const cleanIsbn13 = book.isbn13.replace(/[-\s]/g, '');
      if (booksInLibrary.has(`isbn:${cleanIsbn13}`)) {
        return true;
      }
    }

    // Check by ISBN10
    if (book.isbn10) {
      const cleanIsbn10 = book.isbn10.replace(/[-\s]/g, '');
      if (booksInLibrary.has(`isbn:${cleanIsbn10}`)) {
        return true;
      }
    }

    // Check by ISBN (fallback)
    if (book.isbn) {
      const cleanIsbn = book.isbn.replace(/[-\s]/g, '');
      if (booksInLibrary.has(`isbn:${cleanIsbn}`)) {
        return true;
      }
    }

    // Check by Google Books ID (for Google Books results)
    if (book.id && booksInLibrary.has(`google:${book.id}`)) {
      return true;
    }

    return false;
  };

  const openExplorerDetails = async (book: GoogleBook) => {
    console.log('[Library Explorer] openDetails click', book.title);
    setLoadingSelected(true);
    try {
      // Step 1: Ensure book exists in DB and get UUID
      const dbBookId = await ensureBookInDB(supabase, book);

      // Step 2: Fetch the book row from books table
      const { data: dbBook, error: fetchError } = await supabase
        .from('books')
        .select('id, title, author, isbn, cover_url, total_pages, description, google_books_id, openlibrary_work_key, openlibrary_edition_key, openlibrary_cover_id')
        .eq('id', dbBookId)
        .single();

      if (fetchError) {
        console.error('[Library Explorer openDetails] Error fetching book from DB:', fetchError);
        fatalError('Error fetching book from DB:', fetchError);
        setLoadingSelected(false);
        return;
      }

      if (!dbBook) {
        console.error('[Library Explorer openDetails] Book not found in DB after ensureBookInDB');
        setLoadingSelected(false);
        return;
      }

      // Backfill openlibrary_work_key if missing in DB but present in source object
      const incomingWorkKey =
        (book as any).openLibraryKey ||
        (book as any).openlibrary_work_key ||
        (book as any).key ||
        (book as any).openLibraryWorkKey;

      if (!dbBook.openlibrary_work_key && incomingWorkKey) {
        const normalized = normalizeBookKey(incomingWorkKey);
        if (normalized) {
          const { error: updateError } = await supabase
            .from('books')
            .update({ openlibrary_work_key: normalized })
            .eq('id', dbBookId);

          if (updateError) {
            console.warn('[Library Explorer openDetails] Failed to backfill openlibrary_work_key:', updateError);
          } else {
            // IMPORTANT: Update dbBook object for immediate UI use
            dbBook.openlibrary_work_key = normalized;
            console.log('[Library Explorer openDetails] Backfilled openlibrary_work_key:', normalized);
          }
        }
      }

      // Enrichir les métadonnées manquantes via Edge Function (non bloquant)
      if (!enrichDisabled && (!dbBook.cover_url || !dbBook.total_pages || !dbBook.description)) {
        supabase.functions.invoke('book_enrich_v1', {
          body: {
            bookId: dbBookId,
            isbn: dbBook.isbn || null,
            googleBooksId: dbBook.google_books_id || null,
            openlibraryWorkKey: dbBook.openlibrary_work_key || null,
            openlibraryEditionKey: dbBook.openlibrary_edition_key || null,
          },
        }).catch((error) => {
          console.error('[openExplorerDetails] Error invoking book_enrich_v1:', error);
          const msg = String(error?.message || error);
          if (msg.includes("CORS") || msg.includes("Failed to send a request") || msg.includes("ERR_FAILED") || msg.includes("NetworkError")) {
              setEnrichDisabled(true);
              console.warn('[openExplorerDetails] Enrichissement désactivé (CORS/network error détecté). Reset automatique dans 2 min.');
              setTimeout(() => {
                setEnrichDisabled(false);
                console.log('[openExplorerDetails] Circuit breaker réinitialisé automatiquement');
              }, 120000);
          }
        });
      }

      // Step 3: Translate description if needed
      if (dbBook.description && dbBook.description.trim().length > 0) {
        // Pass the full dbBook object to getTranslatedDescription so it can extract stable book_key
        const translated = await getTranslatedDescription(dbBook, dbBook.description);
        if (translated) {
          dbBook.description = translated;
        }
      }

      // Step 4: Open BookDetailsModal with DB book data
      setSelectedDbBook(dbBook);
      setLoadingSelected(false);
    } catch (error: any) {
      console.error('[Library Explorer openDetails] Unexpected error:', error);
      fatalError('Error opening book details:', error);
      setLoadingSelected(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    setRateLimitError(false);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // For library tabs: immediate search (no debounce needed)
    if (filter !== 'explore') {
      if (query.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      const queryLower = query.toLowerCase();
      const filtered = userBooks.filter((userBook) => {
        const book = userBook.book;
        if (!book) return false;
        
        // NEVER call .includes on possibly null values - always guard strings
        const titleMatch = book.title && typeof book.title === 'string' ? book.title.toLowerCase().includes(queryLower) : false;
        const authorMatch = book.author && typeof book.author === 'string' ? book.author.toLowerCase().includes(queryLower) : false;
        const isbnMatch = book.isbn && typeof book.isbn === 'string' ? book.isbn.toLowerCase().includes(queryLower) : false;
        
        return titleMatch || authorMatch || isbnMatch;
      });

      // Convert to GoogleBook format for consistent UI, but keep book.id for navigation
      const convertedResults: GoogleBook[] = filtered.map((userBook) => {
        const book = userBook.book;
        return {
          id: book.id, // Use database book.id for navigation to details
          title: book.title || '',
          authors: book.author || '',
          category: undefined,
          pageCount: book.total_pages || undefined,
          publisher: undefined,
          isbn: book.isbn || undefined,
          description: book.description || undefined,
          thumbnail: book.cover_url || undefined,
        };
      });

      setSearchResults(convertedResults);
      return;
    }

    // For "explore" tab: search via APIs (Google Books + OpenLibrary)
    if (filter === 'explore') {
      if (query.trim().length < 3) {
        setSearchResults([]);
        setSearching(false);
        setRateLimitError(false);
        // If query is empty, reload community feed
        if (query.trim().length === 0) {
          // Reset search results and reload community feed
          setSearchResults([]);
          if (communityFeed.books.length === 0 && !communityFeed.loading) {
            communityFeed.refresh();
          }
        }
        return;
      }

      setSearching(true);
      
      // Debounce API calls
      searchTimeoutRef.current = window.setTimeout(async () => {
        try {
          let results: GoogleBook[] = [];

          // Priority 1: Try Google Books API
          try {
            const googleResults = await searchGoogleBooks(query.trim(), undefined, 0, 20);
            if (googleResults && googleResults.length > 0) {
              results = googleResults;
              debugLog(`[Library Explorer Search] Found ${googleResults.length} results from Google Books`);
            }
          } catch (googleError: any) {
            if (googleError?.message?.includes('API key')) {
              debugLog('[Library Explorer Search] Google Books API key missing, trying OpenLibrary');
            } else {
              debugLog('[Library Explorer Search] Google Books error, trying OpenLibrary:', googleError);
            }
          }

          // Priority 2: Fallback to OpenLibrary if Google returned 0 results or error
          if (results.length === 0) {
            try {
              const olResults = await searchOpenLibraryBooks(query.trim(), 1);
              if (olResults && olResults.length > 0) {
                // Convert OpenLibraryBook to GoogleBook format
                results = olResults.map((olBook) => ({
                  id: olBook.openLibraryKey || olBook.isbn || `ol-${olBook.title}`,
                  title: olBook.title,
                  authors: olBook.author,
                  category: undefined,
                  pageCount: undefined, // OpenLibraryBook doesn't expose pages directly
                  publisher: undefined,
                  isbn: olBook.isbn || undefined,
                  isbn13: olBook.isbn13 || undefined,
                  isbn10: olBook.isbn10 || undefined,
                  description: undefined,
                  thumbnail: olBook.coverUrl || undefined,
                  cover_i: olBook.cover_i,
                }));
                debugLog(`[Library Explorer Search] Found ${olResults.length} results from OpenLibrary`);
              }
            } catch (olError) {
              debugLog('[Library Explorer Search] OpenLibrary error:', olError);
            }
          }

          setSearchResults(results);
          setSearching(false);
        } catch (error) {
          fatalError('Unexpected error in Explorer search:', error);
          setSearchResults([]);
          setSearching(false);
        }
      }, 300); // 300ms debounce

      return;
    }
  };

  const handleAddBookToLibrary = async (
    book: GoogleBook | UiBook, 
    status: BookStatus, 
    totalPages?: number | null,
    currentPage?: number
  ): Promise<{ success: boolean; alreadyExists: boolean }> => {
    const bookIdForState = (book as any).id || (book as any).openLibraryKey || 'unknown';
    setAddingBookId(bookIdForState);

    try {
      // Get user_id from auth
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error('[handleAddBookToLibrary] auth.getUser error', {
          error: authError,
          message: authError?.message,
          code: (authError as any)?.code,
        });
        fatalError('Error getting user:', authError);
        setAddingBookId(null);
        setBookToAdd(null);
        setToast({ message: 'Erreur d\'authentification', type: 'error' });
        return { success: false, alreadyExists: false };
      }
      const userId = authData.user.id;

      // Step 1: Ensure book exists in DB with all info
      let bookId: string;
      try {
        bookId = await ensureBookInDB(supabase, book);
        
        // Enrichir les métadonnées en arrière-plan (non bloquant)
        if (!enrichDisabled) {
          const bookIsbn = (book as any).isbn || (book as any).isbn13 || (book as any).isbn10 || null;
          supabase.functions.invoke('book_enrich_v1', {
            body: {
              bookId,
              isbn: bookIsbn,
              googleBooksId: (book as any).google_books_id || (book as any).id || null,
              openlibraryWorkKey: (book as any).openlibrary_work_key || (book as any).openLibraryKey || null,
              openlibraryEditionKey: (book as any).openlibrary_edition_key || null,
            },
          }).catch((error) => {
            console.error('[handleAddBookToLibrary] Error invoking book_enrich_v1:', error);
            const msg = String(error?.message || error);
            if (msg.includes("CORS") || msg.includes("Failed to send a request") || msg.includes("ERR_FAILED") || msg.includes("NetworkError")) {
              setEnrichDisabled(true);
              console.warn('[handleAddBookToLibrary] Enrichissement désactivé (CORS/network error détecté). Reset automatique dans 2 min.');
              setTimeout(() => {
                setEnrichDisabled(false);
                console.log('[handleAddBookToLibrary] Circuit breaker réinitialisé automatiquement');
              }, 120000);
            }
          });
        }
      } catch (error: any) {
        console.error('[handleAddBookToLibrary] error ensuring book in DB', {
          error,
          book: book.title,
        });
        fatalError('Error ensuring book in DB:', error);
        setAddingBookId(null);
        setBookToAdd(null);
        setToast({
          message: `Erreur lors de l'ajout du livre: ${error?.message ?? 'inconnue'}`,
          type: 'error',
        });
        return { success: false, alreadyExists: false };
      }

      // Step 2: Check if book already in user_books (idempotent check)
      const { data: existingUserBook, error: checkError } = await supabase
        .from('user_books')
        .select('id, status')
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .maybeSingle();

      if (checkError) {
        console.error('[handleAddBookToLibrary] error checking user_books', {
          userId,
          bookId,
          error: checkError,
          code: (checkError as any).code,
          message: checkError.message,
          details: (checkError as any).details,
          hint: (checkError as any).hint,
        });
        fatalError('Error checking user_books:', checkError);
        setAddingBookId(null);
        setBookToAdd(null);
        setToast({
          message: `Erreur lors de la vérification: ${checkError.message} (${(checkError as any).code ?? 'no code'})`,
          type: 'error',
        });
        return { success: false, alreadyExists: false };
      }

      // Idempotent: if already exists, return success with alreadyExists flag
      if (existingUserBook) {
        console.log('[handleAddBookToLibrary] Book already exists:', {
          userBookId: existingUserBook.id,
          status: existingUserBook.status,
          bookId,
        });
        const statusLabel = existingUserBook.status === 'reading' ? 'En cours' : 
                           existingUserBook.status === 'completed' ? 'Terminé' : 
                           'À lire';
        setAddingBookId(null);
        setBookToAdd(null);
        setToast({ 
          message: `Déjà ajouté (statut: ${statusLabel})`, 
          type: 'info' 
        });
        return { success: true, alreadyExists: true };
      }

      // Step 3: Normalize reading state
      const normalizedState = normalizeReadingState({
        status,
        total_pages: totalPages ?? null,
        current_page: currentPage ?? null,
      });

      // Step 4: Update books.total_pages if provided
      if (normalizedState.total_pages && normalizedState.total_pages > 0) {
        const { data: bookData } = await supabase
          .from('books')
          .select('total_pages')
          .eq('id', bookId)
          .maybeSingle();
        
        if (!bookData?.total_pages) {
          await supabase
            .from('books')
            .update({ total_pages: normalizedState.total_pages })
            .eq('id', bookId);
        }
      }

      // Step 5: Upsert into user_books
      const upsertData: any = {
        user_id: userId,
        book_id: bookId,
        status: normalizedState.status,
        current_page: normalizedState.current_page,
      };

      // Set started_at if provided
      if (normalizedState.started_at) {
        upsertData.started_at = normalizedState.started_at;
      }

      // Set completed_at if provided
      if (normalizedState.completed_at) {
        upsertData.completed_at = normalizedState.completed_at;
      }

      const { data: insertedRows, error: insertError } = await supabase
        .from('user_books')
        .upsert(upsertData, {
          onConflict: 'user_id,book_id',
        })
        .select('id, user_id, book_id, status, current_page, created_at, updated_at');

      if (insertError) {
        // Handle UNIQUE constraint violation (23505) gracefully
        if (insertError.code === '23505') {
          // Book already exists - do a read-back to get the actual status
          const { data: existingRow } = await supabase
            .from('user_books')
            .select('id, status')
            .eq('user_id', userId)
            .eq('book_id', bookId)
            .maybeSingle();

          if (existingRow) {
            const statusLabel = existingRow.status === 'reading' ? t('library.reading') : 
                               existingRow.status === 'completed' ? t('library.completed') : 
                               t('library.wantToRead');
            setAddingBookId(null);
            setBookToAdd(null);
            setToast({ 
              message: `Déjà ajouté (statut: ${statusLabel})`, 
              type: 'info' 
            });
            return { success: true, alreadyExists: true };
          } else {
            // Row not found after 23505 - this is weird, but show generic message
            setAddingBookId(null);
            setBookToAdd(null);
            setToast({ message: 'Ce livre est déjà dans votre bibliothèque', type: 'info' });
            return { success: true, alreadyExists: true };
          }
        }
        
        console.error('[handleAddBookToLibrary] error inserting into user_books', {
          userId,
          bookId,
          status,
          error: insertError,
          code: insertError.code,
          message: insertError.message,
          details: (insertError as any).details,
          hint: (insertError as any).hint,
        });
        fatalError('Error inserting into user_books:', insertError);
        setAddingBookId(null);
        setBookToAdd(null);
        setToast({
          message: `Erreur lors de l'ajout à la bibliothèque: ${insertError.message} (${insertError.code ?? 'no code'})`,
          type: 'error',
        });
        return { success: false, alreadyExists: false };
      }

      const inserted = insertedRows?.[0];
      if (!inserted?.id) {
        fatalError('No inserted user_books row returned');
        setAddingBookId(null);
        setBookToAdd(null);
        setToast({ message: 'Erreur: livre non ajouté', type: 'error' });
        return { success: false, alreadyExists: false };
      }

      // Read-back de la row avec le join book
      const { data: fresh } = await supabase
        .from('user_books')
        .select(`
          id,
          status,
          current_page,
          book_id,
          created_at,
          updated_at,
          book:books (
            id,
            title,
            author,
            cover_url,
            total_pages,
            description,
            isbn,
            google_books_id,
            edition,
            openlibrary_cover_id
          )
        `)
        .eq('id', inserted.id)
        .single();

      // Fallback si book est null
      let finalRow: any = fresh;
      if (finalRow && !finalRow.book && finalRow.book_id) {
        const { data: b } = await supabase
          .from('books')
          .select('id, title, author, cover_url, total_pages, description, isbn, google_books_id, edition, openlibrary_cover_id')
          .eq('id', finalRow.book_id)
          .single();
        
        if (b && !Array.isArray(b)) {
          finalRow = { ...finalRow, book: b };
        }
      }

      if (!finalRow) {
        fatalError('Could not fetch fresh row after insert');
        setAddingBookId(null);
        setBookToAdd(null);
        setToast({ message: 'Erreur lors de la récupération du livre', type: 'error' });
        return { success: false, alreadyExists: false };
      }

      // Create book event based on status (no activity "reading" with duration=0)
      // This creates a social event without polluting stats
      try {
        if (normalizedState.status === 'reading') {
          await createBookEvent(userId, bookId, 'book_started');
        } else if (normalizedState.status === 'want_to_read') {
          await createBookEvent(userId, bookId, 'book_added');
        } else if (normalizedState.status === 'completed') {
          await createBookEvent(userId, bookId, 'book_finished');
        }
      } catch (eventError) {
        console.error('[handleAddBookToLibrary] Error creating book event:', eventError);
        // Don't fail the whole operation if event creation fails
      }

      // Si on est dans l'onglet Explorer, ne pas faire de reload complet
      if (filter === 'explore') {
        setBookToAdd(null);
        await loadBooksInLibrary();
        setToast({ message: 'Livre ajouté avec succès !', type: 'success' });
        return { success: true, alreadyExists: false };
      }

      // Pour les autres onglets, comportement normal avec changement de filtre
      setBookToAdd(null);
      setSearchResults([]);
      setSearchQuery('');

      setFilter(status);
      setUserBooks(prev => {
        // Si on vient d'un autre onglet, remplace la liste (sinon prepend)
        if (filter !== status) {
          return finalRow ? [finalRow] : [];
        }
        // Sinon, ajoute au début de la liste existante
        return finalRow ? [finalRow, ...prev] : prev;
      });

      setToast({ message: 'Livre ajouté avec succès !', type: 'success' });
      return { success: true, alreadyExists: false };
    } catch (error: any) {
      console.error('[handleAddBookToLibrary] ❌ UNEXPECTED ERROR', {
        error,
        errorString: JSON.stringify(error),
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
        platform: Capacitor.getPlatform(),
        bookId: (book as any).id,
        bookTitle: (book as any).title,
      });
      fatalError('Error adding book:', error);
      setAddingBookId(null);
      setBookToAdd(null);
      setToast({
        message: `Une erreur inattendue s'est produite: ${error?.message ?? 'inconnue'} (${error?.code ?? 'no code'})`,
        type: 'error',
      });
      return { success: false, alreadyExists: false };
    } finally {
      setAddingBookId(null);
    }
  };

  const handleDeleteBook = async (userBookId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('user_books')
      .delete()
      .eq('id', userBookId);

    if (error) {
      console.error('[handleDeleteBook] Error deleting user_book:', {
        userBookId,
        error,
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
      });
      setToast({
        message: `Erreur lors de la suppression: ${error.message} (${(error as any).code ?? 'no code'})`,
        type: 'error',
      });
      return; // Ne pas refresh si erreur
    }

    // Update UI immédiatement (optimistic update)
    setUserBooks(prev => prev.filter(b => b.id !== userBookId));
    
    // Refresh booksInLibrary si on est dans Explore (pour le bouton "Déjà ajouté")
    if (filter === 'explore') {
      await loadBooksInLibrary();
    } else {
      // Pour les autres onglets, refresh la liste complète (plus propre)
      await loadUserBooks(filter as BookStatus);
    }
    
    // Toast géré par l'appelant (ManageBookModal)
  };

  // ✅ Fonction loadRecap pour BookRecapModal dans Library.tsx
  const loadRecap = useCallback(async (force = false) => {
    if (!user || !recapBook) return;
    
    const isValidBook = Boolean(recapBook.book?.id && recapBook.book.id !== 'noop' && recapBook.book.title);
    if (!isValidBook) {
      console.log('[Library] loadRecap blocked: invalid book (fallback)');
      return;
    }
    
    // ✅ NE JAMAIS recharger si on est en train de soumettre ou si le défi a été validé
    if (recapUI.challengeSubmitting || recapUI.hasSubmittedChallenge) {
      console.log('[Library] loadRecap blocked', { 
        challengeSubmitting: recapUI.challengeSubmitting,
        hasSubmittedChallenge: recapUI.hasSubmittedChallenge
      });
      return;
    }
    
    // ✅ Guard pour empêcher les doubles loads (StrictMode)
    // Use safe fallback for iOS WebView compatibility
    const reqId = `${Date.now()}-${Math.random()}`;
    recapReqRef.current = reqId;
    
    console.log('[Library] loadRecap called', { force, bookId: recapBook.book.id, uptoPage: recapBook.uptoPage });
    
    setRecapUI(s => ({ ...s, recapLoading: true, recapError: null, recapData: null }));
    
    try {
      const payload: any = {
        bookId: recapBook.book.id,
        uptoPage: recapBook.uptoPage,
        current_page: recapBook.uptoPage,
        language: 'fr',
        force,
      };
      
      if (recapBook.book.book_key) {
        payload.book_key = recapBook.book.book_key;
      } else if (recapBook.book.openlibrary_key) {
        payload.book_key = recapBook.book.openlibrary_key;
      }
      
      if (recapBook.book.isbn) {
        payload.isbn = recapBook.book.isbn;
      }
      
      const { data, error } = await supabase.functions.invoke('book_recap_v2', {
        body: payload,
      });
      
      // ✅ Ignorer les réponses obsolètes
      if (recapReqRef.current !== reqId) {
        console.log('[Library] loadRecap: ignoring stale response', { reqId, current: recapReqRef.current });
        return;
      }
      
      if (error) {
        const requestId = data?.requestId || data?.meta?.requestId || 'unknown';
        const errorMessage = error.message || 'Erreur serveur';
        setRecapUI(s => ({
          ...s,
          recapLoading: false,
          recapError: { message: errorMessage, requestId },
        }));
        return;
      }
      
      if (data && data.ok === false) {
        const requestId = data.requestId || data.meta?.requestId || 'unknown';
        if (data.status === 'no_data') {
          setRecapUI(s => ({
            ...s,
            recapLoading: false,
            recapData: null,
            recapError: null,
          }));
          return;
        }
        const errorMessage = data.error || 'Impossible de charger le rappel';
        const details = data.meta?.details ? ` (${data.meta.details})` : '';
        setRecapUI(s => ({
          ...s,
          recapLoading: false,
          recapError: { message: `${errorMessage}${details}`, requestId },
        }));
        return;
      }
      
      if (data && data.status === 'no_data') {
        setRecapUI(s => ({
          ...s,
          recapLoading: false,
          recapData: null,
          recapError: null,
        }));
        return;
      }
      
      if (data && data.ultra_20s) {
        const mapped = {
          summary: data.summary || '',
          ultra_20s: data.ultra_20s,
          takeaways: data.takeaways || '',
          question: data.question,
          answer: data.answer,
          explanation: data.explanation,
          key_takeaways: data.key_takeaways,
          key_moments: data.key_moments,
          challenge: data.challenge,
          chapters: data.chapters,
          detailed: data.detailed,
          characters: data.characters || [],
          uptoPage: data.uptoPage || data.meta?.uptoPage || recapBook.uptoPage,
          meta: data.meta,
        };
        
        setRecapUI(s => ({
          ...s,
          recapLoading: false,
          recapData: mapped,
          recapError: null,
          // ✅ Ne reset l'onglet que si l'utilisateur n'a pas encore touché
          tab: recapTabTouched ? s.tab : 'personnages',
        }));
      } else {
        const requestId = data?.meta?.requestId || 'unknown';
        setRecapUI(s => ({
          ...s,
          recapLoading: false,
          recapData: null,
          recapError: { message: 'Réponse invalide du serveur', requestId },
        }));
      }
    } catch (err) {
      if (recapReqRef.current !== reqId) return;
      const errorMessage = err instanceof Error ? err.message : 'Erreur inattendue';
      setRecapUI(s => ({
        ...s,
        recapLoading: false,
        recapError: { message: errorMessage, requestId: 'unknown' },
      }));
    }
  }, [user, recapBook, recapUI.challengeSubmitting, recapUI.hasSubmittedChallenge, recapTabTouched]);

  // Auto-load recap when modal opens (same as ActiveSession)
  useEffect(() => {
    if (recapOpen && recapBook && !recapTabTouched) {
      loadRecap(false);
    }
  }, [recapOpen, recapBook, recapTabTouched, loadRecap]);

  // Modal open flag for xp-updated guard (same as ActiveSession)
  useEffect(() => {
    if (recapOpen) {
      document.body.dataset.modalOpen = '1';
    } else {
      document.body.dataset.modalOpen = '0';
    }
    return () => {
      document.body.dataset.modalOpen = '0';
    };
  }, [recapOpen]);

  const handleChangeBookStatus = async (userBookId: string, newStatus: BookStatus) => {
    if (!user) return;

    // Get book_id before updating
    const { data: userBook } = await supabase
      .from('user_books')
      .select('book_id')
      .eq('id', userBookId)
      .single();

    const { error } = await supabase
      .from('user_books')
      .update({ status: newStatus })
      .eq('id', userBookId);

    if (error) {
      console.error('[handleChangeBookStatus] Error updating status:', {
        userBookId,
        newStatus,
        error,
      });
      setToast({
        message: `Erreur lors du déplacement: ${error.message}`,
        type: 'error',
      });
      return;
    }

    // Create book event based on new status
    if (userBook?.book_id) {
      try {
        if (newStatus === 'reading') {
          await createBookEvent(user.id, userBook.book_id, 'book_started');
        } else if (newStatus === 'want_to_read') {
          await createBookEvent(user.id, userBook.book_id, 'book_added');
        } else if (newStatus === 'completed') {
          await createBookEvent(user.id, userBook.book_id, 'book_finished');
        }
      } catch (eventError) {
        console.error('[handleChangeBookStatus] Error creating book event:', eventError);
        // Don't fail the whole operation if event creation fails
      }
    }

    // Update UI immédiatement (optimistic update)
    setUserBooks(prev => prev.filter(b => b.id !== userBookId));
    
    // Refresh booksInLibrary si on est dans Explore
    if (filter === 'explore') {
      await loadBooksInLibrary();
    }
    
    // Refresh la liste complète pour l'onglet courant
    await loadUserBooks(filter as BookStatus);
    
    // Toast géré par l'appelant (ManageBookModal)
  };

  const handleBarcodeScan = async (isbn: string) => {
    if (searching) return;

    setShowScanner(false);
    setSearching(true);

    const cleanIsbn = isbn.replace(/[-\s]/g, '');

    try {
      const { data: allBooks, error } = await supabase
        .from('books')
        .select('*')
        .not('isbn', 'is', null);

      if (error) {
        debugWarn('Error searching local database:', error);
      }

      // 1) Check local Supabase catalog first
      if (allBooks && allBooks.length > 0) {
        const matchingBook = allBooks.find(book =>
          book.isbn && book.isbn.replace(/[-\s]/g, '') === cleanIsbn
        );

        if (matchingBook) {
          const googleBook: GoogleBook = {
            id: matchingBook.id,
            title: matchingBook.title,
            authors: matchingBook.author,
            category: matchingBook.genre || undefined,
            pageCount: matchingBook.total_pages || undefined,
            publisher: matchingBook.publisher || undefined,
            isbn: matchingBook.isbn || undefined,
            description: matchingBook.description || undefined,
            thumbnail: matchingBook.cover_url || undefined,
          };

          setSearching(false);
          setBookToAdd(googleBook);
          
          // Enrichir les métadonnées en arrière-plan si manquantes
          if (!enrichDisabled && (!matchingBook.cover_url || !matchingBook.total_pages || !matchingBook.description)) {
            supabase.functions.invoke('book_enrich_v1', {
              body: {
                bookId: matchingBook.id,
                isbn: cleanIsbn,
              },
            }).catch((error) => {
              console.error('[handleBarcodeScan] Error invoking book_enrich_v1:', error);
              const msg = String(error?.message || error);
              if (msg.includes("CORS") || msg.includes("Failed to send a request") || msg.includes("ERR_FAILED") || msg.includes("NetworkError")) {
                setEnrichDisabled(true);
                console.warn('[handleBarcodeScan] Enrichissement désactivé (CORS/network error détecté). Reset automatique dans 2 min.');
                setTimeout(() => {
                  setEnrichDisabled(false);
                  console.log('[handleBarcodeScan] Circuit breaker réinitialisé automatiquement');
                }, 120000);
              }
            });
          }
          return;
        }
      }

      // 2) Try OpenLibrary by ISBN (primary metadata + cover)
      const olBook = await fetchOpenLibraryByIsbn(cleanIsbn);
      
      // Log for debugging
      console.log('[ISBN] olBook keys', Object.keys(olBook || {}), { 
        title: olBook?.title, 
        author: (olBook as any)?.author, 
        authors: (olBook as any)?.authors 
      });
      
      // Normalize authors: accept author (string) OR authors (string/array)
      const olAuthors = (olBook as any)?.authors || (olBook as any)?.author || '';
      const hasValidAuthor = String(olAuthors).trim().length > 0;
      
      if (olBook && olBook.title && hasValidAuthor) {
        console.log(`[ISBN] OpenLibrary fetchByIsbn found: ${olBook.title}`);

        // Fetch edition metadata for pages and better cover info
        const editionData = await fetchEditionByIsbn(cleanIsbn);
        
        // Get pages: priority editionData > olBook.pages > fetchPagesFromBooksApi
        let pageCount: number | undefined = undefined;
        if (editionData?.pages) {
          pageCount = editionData.pages;
          console.log(`[ISBN] pages from edition: ${pageCount}`);
        } else if ((olBook as any).pages) {
          pageCount = (olBook as any).pages;
          console.log(`[ISBN] pages from search API: ${pageCount}`);
        } else {
          // Fallback: try Books API
          const pagesFromBooksApi = await fetchPagesFromBooksApi(cleanIsbn);
          if (pagesFromBooksApi) {
            pageCount = pagesFromBooksApi;
          }
        }
        console.log(`[ISBN] final pageCount: ${pageCount ?? 'undefined'}`);

        // Get cover: priority edition coverId > olBook cover_i > olBook coverUrl
        let coverUrl: string | null = null;
        let coverId: number | null = null;
        let coverSource: 'OL_ID' | 'OL_ISBN' | 'GOOGLE' | 'NONE' = 'NONE';

        if (editionData?.coverId) {
          coverId = editionData.coverId;
          const coverResult = await fetchCoverUrlWithFallback(coverId, cleanIsbn);
          coverUrl = coverResult.url;
          coverSource = coverResult.source;
        } else if (olBook.cover_i) {
          coverId = olBook.cover_i;
          const coverResult = await fetchCoverUrlWithFallback(coverId, cleanIsbn);
          coverUrl = coverResult.url;
          coverSource = coverResult.source;
        } else if (olBook.coverUrl) {
          coverUrl = olBook.coverUrl;
          coverSource = 'OL_ISBN'; // Assume it's from ISBN-based URL
        }

        console.log(`[ISBN] final thumbnail: ${coverUrl || 'null'}`);
        console.log(`[ISBN] cover source: ${coverSource}`);

        // If no cover from OpenLibrary, try Google Books as fallback
        if (!coverUrl) {
          console.log('[ISBN] No OpenLibrary cover, trying Google Books fallback');
          const googleBook = await searchBookByISBN(cleanIsbn);
          if (googleBook?.thumbnail) {
            coverUrl = googleBook.thumbnail;
            coverSource = 'GOOGLE';
            console.log('[ISBN] cover source: GOOGLE (from Google Books)');
            
            // Also get pageCount from Google if missing
            if (!pageCount && googleBook.pageCount) {
              pageCount = googleBook.pageCount;
              console.log(`[ISBN] pages from Google Books: ${pageCount}`);
            }
          }
        }

        // Build OpenLibrary work/edition keys
        let openLibraryWorkKey: string | undefined = undefined;
        let openLibraryEditionKey: string | undefined = undefined;
        
        if (editionData?.workKey) {
          openLibraryWorkKey = editionData.workKey;
        } else if (olBook.openLibraryWorkKey) {
          openLibraryWorkKey = olBook.openLibraryWorkKey;
        }
        
        if (editionData?.editionKey) {
          openLibraryEditionKey = editionData.editionKey;
        }

        // Normalize authors for GoogleBook format (string, not array)
        const normalizedAuthors = Array.isArray(olAuthors) 
          ? olAuthors.join(', ') 
          : String(olAuthors);

        const googleBookFromOl: GoogleBook & { openLibraryWorkKey?: string; openLibraryEditionKey?: string; openlibrary_cover_id?: number } = {
          id: olBook.isbn13 || olBook.isbn10 || cleanIsbn,
          title: olBook.title,
          authors: normalizedAuthors,
          category: undefined,
          pageCount: pageCount ?? undefined,
          publisher: undefined,
          isbn: olBook.isbn13 || olBook.isbn10 || cleanIsbn,
          description: olBook.description,
          thumbnail: coverUrl || undefined,
          isbn13: olBook.isbn13,
          isbn10: olBook.isbn10,
          openLibraryWorkKey,
          openLibraryEditionKey,
          openlibrary_cover_id: coverId || undefined,
        };

        setSearching(false);
        setBookToAdd(googleBookFromOl);
        
        // Enrichir les métadonnées en arrière-plan après ensureBookInDB
        // (l'enrichissement sera déclenché automatiquement dans ensureBookInDB)
        return;
      }

      // 3) Fallback to Google Books flow (existing behavior)
      let book = await searchBookByISBN(cleanIsbn);

      if (!book && cleanIsbn.length === 13) {
        const isbn10 = cleanIsbn.slice(3, 12);
        book = await searchBookByISBN(isbn10);
      }

      if (!book) {
        const results = await searchGoogleBooks(cleanIsbn);
        if (results && results.length > 0) {
          book = results[0];
        }
      }

      setSearching(false);

      if (book) {
        setBookToAdd(book);
        // Enrichissement sera déclenché automatiquement dans ensureBookInDB
      } else {
        // Livre non trouvé via Google Books -> ouverture de l'ajout manuel
        setShowManualAdd(true);
      }
    } catch (error) {
      fatalError('Error in barcode scan:', error);
      setSearching(false);
      alert('Une erreur est survenue lors de la recherche');
    }
  };

  // Ancienne logique d'ajout manuel via AddBookManuallyModal remplacée

  // Measure header height dynamically
  useLayoutEffect(() => {
    const measureHeader = () => {
      if (headerRef.current) {
        const height = headerRef.current.getBoundingClientRect().height;
        setHeaderH(height);
        debugLog('[Library] Header height measured', { height });
      }
    };

    // Measure on mount
    measureHeader();

    // Measure on resize and orientation change
    window.addEventListener('resize', measureHeader);
    window.addEventListener('orientationchange', measureHeader);

    return () => {
      window.removeEventListener('resize', measureHeader);
      window.removeEventListener('orientationchange', measureHeader);
    };
  }, []);

  // Measure search bar height dynamically
  useLayoutEffect(() => {
    const measureSearchBar = () => {
      if (searchBarRef.current) {
        const height = searchBarRef.current.getBoundingClientRect().height;
        setSearchBarHeight(height);
        debugLog('[Library] Search bar height measured', { height });
      }
    };

    // Measure on mount
    measureSearchBar();

    // Measure on resize and orientation change
    window.addEventListener('resize', measureSearchBar);
    window.addEventListener('orientationchange', measureSearchBar);

    return () => {
      window.removeEventListener('resize', measureSearchBar);
      window.removeEventListener('orientationchange', measureSearchBar);
    };
  }, []);

  // Debug: Log platform and search bar visibility
  useEffect(() => {
    const platform = Capacitor.getPlatform();
    debugLog('[Library] Component mounted', { 
      platform, 
      isNative: Capacitor.isNativePlatform(),
      searchBarRendered: true, // Always rendered, no conditional
      searchBarHeight
    });
  }, [searchBarHeight]);

  return (
    <div className="h-screen max-w-2xl mx-auto font-sans text-neutral-900 overflow-hidden" style={{ isolation: 'isolate', position: 'relative' }}>
      {/* Fixed Header - wrapper mesurable */}
      <div 
        ref={headerRef}
        style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 60 
        }}
      >
        <AppHeader
          title={t('library.title')}
          rightActions={
            <button
              onClick={() => {
                // Toggle scanner: ouvrir si fermé, fermer si ouvert
                setShowScanner(!showScanner);
              }}
              className="p-2.5 bg-primary text-black rounded-xl hover:brightness-95 transition-all shadow-sm active:scale-[0.99]"
              title={showScanner ? "Fermer le scanner" : "Scanner un code-barres"}
            >
              {showScanner ? (
                <X className="w-5 h-5" />
              ) : (
                <Scan className="w-5 h-5" />
              )}
            </button>
          }
        />
      </div>
      
      {/* Fixed Search + Tabs section (below header) */}
      {/* Always visible on all platforms - no conditional rendering */}
      <div 
        ref={searchBarRef}
        data-search-bar
        className="fixed left-0 right-0 bg-white border-b border-gray-100"
        style={{
          top: `${headerH}px`, // Positionné juste en dessous du header mesuré
          zIndex: 40, // Au-dessous du header (zIndex 60)
          visibility: 'visible', // Explicitly ensure visibility
          display: 'block', // Explicitly ensure display
          position: 'fixed', // Explicitly ensure fixed positioning
        }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="mb-3 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-sub-light" />
            <input
              type="text"
              placeholder="Rechercher un livre (titre, auteur...)"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white ${
                filter === 'explore' ? 'pr-12' : ''
              }`}
            />
            {filter === 'explore' && !searchQuery && (
              <button
                onClick={() => {
                  communityFeed.refresh();
                }}
                disabled={communityFeed.loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-black/5 transition disabled:opacity-50"
                title="Rafraîchir"
              >
                <RefreshCw className={`w-5 h-5 text-black/60 ${communityFeed.loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                filter === 'all'
                  ? 'bg-primary text-black shadow-sm'
                  : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilter('reading')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                filter === 'reading'
                  ? 'bg-primary text-black shadow-sm'
                  : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
              }`}
            >
              En cours
            </button>
            <button
              onClick={() => setFilter('want_to_read')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                filter === 'want_to_read'
                  ? 'bg-primary text-black shadow-sm'
                  : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
              }`}
            >
              À lire
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                filter === 'completed'
                  ? 'bg-primary text-black shadow-sm'
                  : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
              }`}
            >
              Terminé
            </button>
            <button
              onClick={() => setFilter('explore')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                filter === 'explore'
                  ? 'bg-primary text-black shadow-sm'
                  : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
              }`}
            >
              Explorer
            </button>
          </div>
        </div>
      </div>

      {/* ✅ SCROLL ICI - Single scrollable container with proper padding */}
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto safe-bottom-content"
        style={{
          paddingTop: `${searchBarHeight}px`, // Only search bar height (header is sticky and takes space in flow)
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y', // Allow vertical panning only
        }}
      >
        <div 
          className="px-4 pb-4 no-scrollbar"
          style={{
            paddingTop: '0px', // No extra spacing after filters
            paddingBottom: `calc(32px + ${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
          }}
        >
        {searching && !searchQuery && (
          <div className="mb-6">
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
              <div className="text-text-sub-light">{t('library.searching')}</div>
            </div>
          </div>
        )}

        {searchQuery && (
          <div className="mb-6">
            {rateLimitError && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
                <p className="font-medium">Recherche temporairement indisponible. Réessayez dans quelques secondes.</p>
              </div>
            )}
            {searching ? (
              <div className="text-center py-8 text-text-sub-light">Recherche en cours...</div>
            ) : searchResults.length === 0 && !rateLimitError ? (
              <div className="text-center py-8 text-text-sub-light">
                Aucun résultat pour "{searchQuery}"
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-semibold tracking-tight mb-3">
                  Résultats ({searchResults.length})
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.map((book, index) => {
                    const alreadyAdded = filter === 'explore' && isBookInLibrary(book);
                    // Generate stable key: id || isbn || title-index
                    const stableKey = book.id || book.isbn13 || book.isbn10 || book.isbn || `${book.title}-${index}`;
                    
                    return (
                      <div
                        key={stableKey}
                        className="flex flex-col rounded-2xl bg-white border border-black/5 p-2 shadow-[0_1px_10px_rgba(0,0,0,0.04)] overflow-hidden"
                      >
                        <div className="rounded-2xl overflow-hidden bg-neutral-100 shadow-[0_10px_25px_rgba(0,0,0,0.10)]">
                          <div
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer"
                            onClick={() => filter === 'explore' ? openExplorerDetails(book) : setSelectedBookDetails(book)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                filter === 'explore' ? openExplorerDetails(book) : setSelectedBookDetails(book);
                              }
                            }}
                          >
                            <BookCover
                              coverUrl={book.thumbnail}
                              title={book.title}
                              author={book.authors || 'Auteur inconnu'}
                              isbn13={book.isbn13 || null}
                              isbn10={book.isbn10 || null}
                              cover_i={(book as any).cover_i || null}
                              googleCoverUrl={book.googleCoverUrl || book.thumbnail || null}
                              className="w-full aspect-[2/3] bg-neutral-100"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col flex-1 mt-2">
                          <button
                            type="button"
                            className="text-[13px] font-semibold leading-snug line-clamp-2 text-left"
                            onClick={() => filter === 'explore' ? openExplorerDetails(book) : setSelectedBookDetails(book)}
                          >
                            {book.title}
                          </button>
                          <p className="text-[11px] text-black/50 line-clamp-1">{book.authors}</p>

                          {filter === 'explore' ? (
                            alreadyAdded ? (
                              <button
                                disabled
                                className="mt-2 w-full rounded-xl bg-gray-200 text-gray-600 py-2 text-[12px] font-medium disabled:opacity-60"
                              >
                                Déjà ajouté
                              </button>
                            ) : (
                              <button
                                onClick={() => setBookToAdd(book)}
                                disabled={addingBookId === book.id}
                                className="mt-2 w-full rounded-xl bg-black text-white py-2 text-[12px] font-medium active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {addingBookId === book.id ? 'Ajout en cours...' : 'Ajouter'}
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => {
                                // For search results (non-explore tabs), open BookDetailsModal with full book object
                                setSelectedBookDetails(book);
                              }}
                              className="mt-2 w-full rounded-xl bg-gray-100 text-text-main-light py-2 text-[12px] font-medium hover:bg-gray-200 transition"
                            >
                              {t('book.details')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {!searchQuery && loading && filter !== 'explore' ? (
          <div className="text-center py-12 text-text-sub-light">Chargement...</div>
        ) : filter === 'explore' ? (
          <div className="bg-neutral-50 min-h-screen">
            <div className="max-w-4xl mx-auto px-4 pb-20">
              {/* Explorer: Community Feed OR Search Results (mutually exclusive) */}
              {(() => {
                const isSearchMode = explorerSearch.query && explorerSearch.query.trim().length >= 2;
                
                // ============================================
                // SEARCH MODE: Show search results
                // ============================================
                if (isSearchMode) {
                  return (
                    <>
                      {/* Search header */}
                      <div className="flex items-center justify-between mb-6 pt-4">
                        <h2 className="text-lg font-bold text-text-main-light">
                          Recherche: "{explorerSearch.query}"
                        </h2>
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            explorerSearch.clear();
                          }}
                          className="p-2 rounded-xl bg-white border border-black/10 hover:bg-gray-50 transition-all"
                          title="Effacer la recherche"
                        >
                          <X className="w-5 h-5 text-black/60" />
                        </button>
                      </div>

                      {/* Search results */}
                      {explorerSearch.searching ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {Array.from({ length: 8 }).map((_, i) => (
                            <div key={`search-skeleton-${i}`} className="bg-white rounded-3xl overflow-hidden shadow-sm animate-pulse">
                              <div className="w-full aspect-[3/4] bg-gray-200"></div>
                              <div className="p-4 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : explorerSearch.results.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {explorerSearch.results.map((book) => {
                            const bookKey = canonicalBookKey(book) || book.id;
                            const isInLibrary = isBookInLibrary(book);
                            
                            return (
                              <SearchResultCard
                                key={bookKey}
                                book={book}
                                isInLibrary={isInLibrary}
                                onOpenDetails={async (book) => {
                                  await openExplorerDetails(book);
                                }}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-16">
                          <SearchIcon className="w-16 h-16 mx-auto mb-4 text-text-sub-light opacity-50" />
                          <p className="text-lg font-medium text-text-main-light mb-2">
                            Aucun résultat trouvé
                          </p>
                          <p className="text-sm text-text-sub-light">
                            Essayez avec d'autres mots-clés
                          </p>
                        </div>
                      )}
                    </>
                  );
                }

                // ============================================
                // COMMUNITY MODE: Show community liked books
                // ============================================
                return (
                  <>
                    {/* Community header */}
                    <div className="flex items-center justify-between mb-6 pt-4">
                      <h2 className="text-lg font-bold text-text-main-light">
                        Livres aimés par la communauté
                      </h2>
                      <button
                        onClick={communityFeed.refresh}
                        disabled={communityFeed.loading}
                        className="p-2 rounded-xl bg-white border border-black/10 hover:bg-gray-50 transition-all disabled:opacity-50"
                        title="Actualiser"
                      >
                        <RefreshCw className={`w-5 h-5 text-black/60 ${communityFeed.loading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {/* Community feed */}
                    {communityFeed.loading && communityFeed.books.length === 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={`community-skeleton-${i}`} className="bg-white rounded-3xl overflow-hidden shadow-sm animate-pulse">
                            <div className="w-full aspect-[3/4] bg-gray-200"></div>
                            <div className="p-4 space-y-2">
                              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : communityFeed.books.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {communityFeed.books.map((book) => {
                            const bookKey = canonicalBookKey({ book_key: book.book_key }) || book.book_key;
                            const socialCounts = {
                              likes: communityFeed.socialCounts[bookKey]?.likes ?? book.likes_count,
                              comments: communityFeed.socialCounts[bookKey]?.comments ?? book.comments_count,
                              isLiked: communityFeed.socialCounts[bookKey]?.isLiked ?? false,
                            };
                            
                            // Check if book is in library
                            const googleBookLike: GoogleBook & { openLibraryKey?: string } = {
                              id: book.google_books_id || book.book_key,
                              title: book.title || '',
                              authors: book.author || '',
                              thumbnail: book.cover_url || undefined,
                              isbn: book.isbn || undefined,
                              isbn13: book.isbn || undefined,
                              isbn10: book.isbn || undefined,
                              pageCount: book.total_pages || undefined,
                              description: book.description || undefined,
                              openLibraryKey: book.openlibrary_work_key || book.openlibrary_edition_key || undefined,
                              googleCoverUrl: book.google_books_id ? `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : undefined,
                            };
                            const isInLibrary = isBookInLibrary(googleBookLike);
                            
                            return (
                              <CommunityBookCard
                                key={bookKey}
                                book={book}
                                socialCounts={socialCounts}
                                isInLibrary={isInLibrary}
                                onOpenDetails={async () => {
                                  await openExplorerDetails(googleBookLike);
                                }}
                                isLiking={likingBookKeys.has(bookKey)}
                                onToggleLike={async () => {
                                  if (!user?.id) return;
                                  
                                  // CRITICAL: Ensure stable canonical key for RPC call
                                  // Use the bookKey already computed with canonicalBookKey above
                                  const stableKey = bookKey; // Already canonical from line above: canonicalBookKey({ book_key: book.book_key }) || book.book_key
                                  
                                  if (!stableKey || stableKey === 'unknown') {
                                    console.warn('[Library] Toggle like: invalid bookKey', stableKey);
                                    return;
                                  }
                                  
                                  // Check in-flight lock
                                  if (likeInFlightRef.current.has(stableKey)) {
                                    console.log('[Library] Toggle like: already in-flight for', stableKey);
                                    return;
                                  }
                                  
                                  // Throttle: ignore taps within 350ms
                                  const lastTap = lastLikeTapRef.current.get(stableKey) || 0;
                                  const now = Date.now();
                                  if (now - lastTap < 350) {
                                    console.log('[Library] Toggle like: throttled for', stableKey);
                                    return;
                                  }
                                  lastLikeTapRef.current.set(stableKey, now);
                                  
                                  // Set in-flight lock (both ref and state for re-render)
                                  likeInFlightRef.current.add(stableKey);
                                  setLikingBookKeys(prev => new Set(prev).add(stableKey));
                                  
                                  // Capture current state for rollback
                                  const prevLiked = socialCounts.isLiked;
                                  const prevLikes = socialCounts.likes;
                                  const optimistic = !prevLiked;
                                  
                                  // Optimistic update
                                  communityFeed.updateSocialCounts(stableKey, {
                                    likes: optimistic ? Math.max(0, prevLikes + 1) : Math.max(0, prevLikes - 1),
                                    comments: socialCounts.comments,
                                    isLiked: optimistic,
                                  });
                                  
                                  try {
                                    // CRITICAL: Use centralized RPC function - never touch book_likes directly
                                    const { data, error } = await supabase.rpc('toggle_book_like', { p_book_key: stableKey });
                                    
                                    if (error) {
                                      console.error('toggle_book_like error', error.code, error.message, error.details);
                                      throw error;
                                    }
                                    
                                    // Handle response: data[0] contains { liked: boolean, likes: number }
                                    const row = Array.isArray(data) ? data[0] : data;
                                    
                                    if (!row || typeof row.liked !== 'boolean') {
                                      console.error('[Library] Invalid RPC response:', { data, row });
                                      throw new Error('Invalid RPC response');
                                    }
                                    
                                    // CRITICAL: Use server response - NEVER infer state locally
                                    const liked = row.liked;
                                    const likes = typeof row.likes === 'number' 
                                      ? Math.max(0, row.likes) 
                                      : (liked ? Math.max(0, prevLikes + 1) : Math.max(0, prevLikes - 1));
                                    
                                    // Update with server response (never negative)
                                    communityFeed.updateSocialCounts(stableKey, {
                                      likes: Math.max(0, likes),
                                      comments: socialCounts.comments,
                                      isLiked: liked,
                                    });
                                    
                                    // Dispatch global event ONCE with final numbers (already done by toggleBookLike in bookSocial.ts)
                                    // This is redundant but safe - the event is idempotent
                                  } catch (err: any) {
                                    console.error('[Library] Toggle like error:', err);
                                    // Rollback on error
                                    communityFeed.updateSocialCounts(stableKey, {
                                      likes: prevLikes,
                                      comments: socialCounts.comments,
                                      isLiked: prevLiked,
                                    });
                                    setToast({ message: 'Erreur lors du like', type: 'error' });
                                  } finally {
                                    // Remove in-flight lock (both ref and state)
                                    likeInFlightRef.current.delete(stableKey);
                                    setLikingBookKeys(prev => {
                                      const next = new Set(prev);
                                      next.delete(stableKey);
                                      return next;
                                    });
                                  }
                                }}
                                onOpenComments={() => {
                                  setSelectedBookForComments(googleBookLike);
                                }}
                                onOpenLikers={(book) => {
                                  // CRITICAL: Use canonical key and candidates for robust lookup
                                  const stableKey = canonicalBookKey({ book_key: book.book_key }) || book.book_key;
                                  if (stableKey && stableKey !== 'unknown') {
                                    setLikedByBookKey(stableKey);
                                    setLikedByTitle(book.title || 'Titre inconnu');
                                  }
                                }}
                              />
                            );
                          })}
                        </div>

                        {/* Infinite scroll sentinel */}
                        {communityFeed.hasMore && (
                          <div ref={loadMoreRef} className="h-12 flex items-center justify-center mt-6">
                            {communityFeed.loading && (
                              <span className="text-xs text-black/40">Chargement...</span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-16">
                        <Heart className="w-16 h-16 mx-auto mb-4 text-text-sub-light opacity-50" />
                        <p className="text-lg font-medium text-text-main-light mb-2">
                          Aucun livre aimé pour le moment
                        </p>
                        <p className="text-sm text-text-sub-light">
                          Les livres que la communauté aime apparaîtront ici
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        ) : !searchQuery && userBooks.length === 0 ? (
          <div className="text-center py-12">
            <Book className="w-16 h-16 mx-auto mb-4 text-text-sub-light" />
            <p className="text-lg font-medium text-text-main-light mb-2">
              {filter === 'reading' && t('library.noBooks')}
              {filter === 'want_to_read' && t('library.noBooks')}
              {filter === 'completed' && t('library.noBooks')}
            </p>
            <p className="text-sm text-text-sub-light mb-4">
              Envie de découvrir de nouveaux livres?
            </p>
            <button
              onClick={() => setFilter('explore')}
              className="px-6 py-3 bg-primary text-black rounded-xl font-bold hover:brightness-95 transition-all inline-flex items-center gap-2"
            >
              <TrendingUp className="w-5 h-5" />
              {t('library.explore')}
            </button>
          </div>
        ) : !searchQuery && userBooks.length > 0 ? (
          <div className="space-y-3">
            {(() => {
              // Dédupliquer les livres par book.id avant le render
              const uniqueBooks = Array.from(
                new Map(userBooks.map(b => [b.book?.id || b.id, b])).values()
              );
              return uniqueBooks.map((userBook) => {
                const book = userBook.book;
              if (!book) {
                debugWarn('UserBook without book data (likely RLS on books):', userBook);
                return (
                  <div key={userBook.id} className="p-4 bg-card-light rounded-xl border border-gray-200">
                    <p className="text-sm text-text-sub-light">Livre introuvable (droits de lecture).</p>
                    <p className="text-xs text-text-sub-light">book_id: {userBook.book_id}</p>
                  </div>
                );
              }
              // Use custom fields if present, otherwise fallback to book fields
              const displayTitle = (userBook as any).custom_title ?? book.title;
              const displayAuthor = (userBook as any).custom_author ?? book.author;
              const displayPages = (userBook as any).custom_total_pages ?? book.total_pages ?? null;
              const displayCover: string | null = (userBook as any).custom_cover_url ?? book.cover_url ?? null;
              
              // Use displayPages for progress calculation (custom_total_pages if present)
              const progress = getProgress(userBook.current_page, displayPages ?? null);

              // ✅ UNE SEULE clé stable pour toggle + affichage
              const stableBookKey =
                canonicalBookKey(book) ||
                (book.book_key && normalizeBookKey(book.book_key)) ||
                book.book_key;

                return (
                  <div
                    key={userBook.id}
                    className="flex gap-4 p-4 bg-card-light rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                  >
                  <div
                    onClick={() => setDetailsBookId(book.id)}
                    className="cursor-pointer hover:scale-105 transition-transform"
                  >
                    <BookCover
                      custom_cover_url={(userBook as any).custom_cover_url || null}
                      cacheKey={userBook.updated_at}
                      coverUrl={displayCover}
                      title={displayTitle}
                      author={displayAuthor || 'Auteur inconnu'}
                      isbn={(book as any).isbn || null}
                      isbn13={(book as any).isbn13 || null}
                      isbn10={(book as any).isbn10 || null}
                      cover_i={(book as any).openlibrary_cover_id || null}
                      openlibrary_cover_id={(book as any).openlibrary_cover_id || null}
                      googleCoverUrl={(book as any).google_books_id ? `https://books.google.com/books/content?id=${(book as any).google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : null}
                      className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-md"
                      bookId={book.id}
                      showAddCoverButton={!((userBook as any).custom_cover_url)}
                      onAddCover={() => {
                        setAddCoverBookId(book.id);
                        setAddCoverBookTitle(displayTitle);
                      }}
                      onCoverLoaded={async (url) => {
                        // Sauvegarder la cover dans Supabase si elle n'existe pas déjà
                        if (book.id && !book.cover_url && url && !url.includes('placeholder')) {
                          try {
                            await supabase
                              .from('books')
                              .update({ cover_url: url })
                              .eq('id', book.id);
                            console.log(`[Library] Cached cover for book ${book.id}: ${url}`);
                          } catch (error) {
                            console.warn('[Library] Failed to cache cover:', error);
                          }
                        }
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col">
                    {/* Header row: Title/Author + More */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-text-main-light mb-1 line-clamp-2">
                          {displayTitle}
                        </h3>
                        <p className="text-sm text-text-sub-light truncate">
                          {displayAuthor}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBookToManage({ ...userBook, book });
                        }}
                        className="shrink-0 p-2 bg-gray-100 hover:bg-gray-200 rounded-xl"
                        title="Options"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>

                    {filter === 'reading' && displayPages > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs text-text-sub-light mb-1">
                          <span>
                            {userBook.current_page} {displayPages ? `/ ${displayPages} pages` : 'pages'}
                          </span>
                          <span className="font-semibold">{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {book.genre && (
                        <span className="inline-block text-xs bg-primary/20 text-primary px-2 py-1 rounded-full font-medium">
                          {book.genre}
                        </span>
                      )}
                      {displayPages ? (
                        <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
                          {displayPages} pages
                        </span>
                      ) : (
                        <span className="inline-block text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
                          Pages inconnues
                        </span>
                      )}
                    </div>

                    {/* Footer actions */}
                    <div className="flex items-center justify-end gap-2">
                      {/* J'aime */}
                      {(() => {
                        const likesCount =
                          stableBookKey ? (librarySocialCounts[stableBookKey]?.likes ?? 0) : 0;

                        const isLiked =
                          stableBookKey
                            ? (librarySocialCounts[stableBookKey]?.isLiked ?? book.is_liked === true)
                            : (book.is_liked === true);

                        return (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!user?.id) return;

                              if (!stableBookKey || stableBookKey === 'unknown') return;

                              const prevLiked = isLiked;
                              const optimistic = !prevLiked;

                              // optimistic UI
                              setUserBooks(prevState =>
                                prevState.map(ub =>
                                  ub.book?.id === book.id
                                    ? { ...ub, book: { ...ub.book, is_liked: optimistic } }
                                    : ub
                                )
                              );

                              try {
                                // CRITICAL: Use centralized RPC function - never touch book_likes directly
                                const { data, error } = await supabase.rpc('toggle_book_like', { p_book_key: stableBookKey });
                                
                                if (error) {
                                  console.error('toggle_book_like error', error.code, error.message, error.details);
                                  throw error;
                                }

                                // Handle response: data[0] contains { liked: boolean, likes: number }
                                const row = Array.isArray(data) ? data[0] : data;
                                
                                if (!row || typeof row.liked !== 'boolean') {
                                  console.error('[Library] Invalid RPC response:', { data, row });
                                  throw new Error('Invalid RPC response');
                                }

                                // CRITICAL: Use server response - NEVER infer state locally
                                const liked = row.liked;
                                const likes = typeof row.likes === 'number' 
                                  ? Math.max(0, row.likes) 
                                  : (liked ? (librarySocialCounts[stableBookKey]?.likes ?? 0) + 1 : Math.max(0, (librarySocialCounts[stableBookKey]?.likes ?? 0) - 1));

                                // ✅ source de vérité = server response
                                setLibrarySocialCounts(prev => ({
                                  ...prev,
                                  [stableBookKey]: {
                                    likes: Math.max(0, likes),
                                    comments: prev[stableBookKey]?.comments ?? 0,
                                    isLiked: liked,
                                  }
                                }));

                                // ✅ garde userBooks cohérent aussi (pour le coeur)
                                setUserBooks(prevState =>
                                  prevState.map(ub =>
                                    ub.book?.id === book.id
                                      ? { ...ub, book: { ...ub.book, is_liked: liked } }
                                      : ub
                                  )
                                );

                                // Dispatch global event (already done by toggleBookLike in bookSocial.ts, but safe to duplicate)
                                window.dispatchEvent(new CustomEvent('book-social-counts-changed', {
                                  detail: {
                                    bookKey: stableBookKey,
                                    likes: Math.max(0, likes),
                                    comments: librarySocialCounts[stableBookKey]?.comments ?? 0,
                                    isLiked: liked
                                  }
                                }));

                                // Also update community feed if this book is in the feed
                                communityFeed.updateSocialCounts(stableBookKey, {
                                  likes: typeof likes === 'number' ? likes : (communityFeed.socialCounts[stableBookKey]?.likes ?? 0) + (liked ? 1 : -1),
                                  comments: communityFeed.socialCounts[stableBookKey]?.comments ?? 0,
                                  isLiked: liked,
                                });
                              } catch (err: any) {
                                // Error handling: show toast only on error
                                if (err?.code || err?.message) {
                                  console.error('toggle_book_like error', err.code, err.message, err.details);
                                } else {
                                  console.error('[Library] Toggle like error:', err);
                                }
                                // Rollback optimistic update
                                setUserBooks(prevState =>
                                  prevState.map(ub =>
                                    ub.book?.id === book.id
                                      ? { ...ub, book: { ...ub.book, is_liked: prevLiked } }
                                      : ub
                                  )
                                );
                                setLibrarySocialCounts(prev => ({
                                  ...prev,
                                  [stableBookKey]: {
                                    likes: prev[stableBookKey]?.likes ?? 0,
                                    comments: prev[stableBookKey]?.comments ?? 0,
                                    isLiked: prevLiked,
                                  }
                                }));
                                setToast({ message: 'Erreur lors du like', type: 'error' });
                              }
                            }}
                            className={`h-9 px-3 rounded-xl flex items-center gap-1 text-sm font-medium ${
                              isLiked
                                ? 'bg-red-50 text-red-600'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            title={isLiked ? 'Ne plus aimer' : 'Aimer'}
                          >
                            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                            <span>{likesCount}</span>
                          </button>
                        );
                      })()}

                      {/* IA */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecapBook({
                            book: {
                              id: book.id,
                              title: displayTitle,
                              author: displayAuthor,
                              cover_url: displayCover,
                              total_pages: displayPages,
                              isbn: (book as any).isbn || null,
                              book_key: (book as any).book_key || (book as any).openlibrary_work_key || null,
                              openlibrary_key: (book as any).openlibrary_work_key || null,
                              google_books_id: (book as any).google_books_id || null,
                            },
                            uptoPage: userBook.current_page || 0,
                          });
                          setRecapOpen(true);
                        }}
                        className="h-9 px-3 rounded-xl bg-black text-white text-sm font-medium flex items-center gap-1"
                        title="Résumé IA"
                      >
                        <Sparkles className="w-4 h-4" />
                        IA
                      </button>
                    </div>
                  </div>
                </div>
                );
              });
            })()}
          </div>
        ) : null}
        </div>
      </div>

      {detailsBookId && (() => {
        // Find the userBook data for this bookId to get userBookId and currentPage
        const userBook = userBooks.find(ub => ub.book?.id === detailsBookId);
        const userBookId = userBook?.id;
        const currentPage = userBook?.current_page;
        
        return (
          <BookDetailsWithManagement
            bookId={detailsBookId}
            userBookId={userBookId}
            currentPage={currentPage}
            onClose={() => {
              setDetailsBookId(null);
              loadUserBooks();
            }}
            onEditRequested={() => {
              if (userBook) {
                setBookToEdit({ ...userBook, book: userBook.book });
                setDetailsBookId(null);
              }
            }}
            onOpenRecap={() => {
              if (userBook && userBook.book) {
                const displayTitle = (userBook as any).custom_title ?? userBook.book.title;
                const displayAuthor = (userBook as any).custom_author ?? userBook.book.author;
                const displayPages = (userBook as any).custom_total_pages ?? userBook.book.total_pages ?? null;
                const displayCover = (userBook as any).custom_cover_url ?? userBook.book.cover_url ?? null;
                
                setRecapBook({
                  book: {
                    id: userBook.book.id,
                    title: displayTitle,
                    author: displayAuthor,
                    cover_url: displayCover,
                    total_pages: displayPages,
                    isbn: userBook.book.isbn || null,
                    book_key: (userBook.book as any).book_key || (userBook.book as any).openlibrary_work_key || null,
                    openlibrary_key: (userBook.book as any).openlibrary_work_key || null,
                    google_books_id: userBook.book.google_books_id || null,
                  },
                  uptoPage: userBook.current_page || 0,
                });
                setRecapOpen(true);
                setDetailsBookId(null);
              }
            }}
          />
        );
      })()}

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {loadingSelected && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center">
          <div className="bg-background-light rounded-2xl p-8">
            <div className="text-text-sub-light">{t('common.loading')}</div>
          </div>
        </div>
      )}

      {selectedDbBook && (
        <BookDetailsModal
          book={selectedDbBook}
          onClose={() => setSelectedDbBook(null)}
          showAddButton={true}
          showAiButton={false}
          onAddToLibrary={(dbBook) => {
            // Ouvre le choix de statut (En cours / À lire / Terminé)
            setBookToAdd(dbBook as any);
            setSelectedDbBook(null); // option: fermer les détails
          }}
        />
      )}

      {selectedBookDetails && (
        <BookDetailsModal
          book={{
            id: selectedBookDetails.id,
            title: selectedBookDetails.title,
            author: selectedBookDetails.authors,
            cover_url: selectedBookDetails.thumbnail,
            genre: selectedBookDetails.category,
            total_pages: (selectedBookDetails.pageCount && selectedBookDetails.pageCount > 0) ? selectedBookDetails.pageCount : null,
            description: selectedBookDetails.description,
            publisher: selectedBookDetails.publisher,
            isbn: selectedBookDetails.isbn,
            google_books_id: selectedBookDetails.id?.startsWith('google:') ? selectedBookDetails.id.replace('google:', '') : (selectedBookDetails as any).google_books_id,
            openLibraryKey: (selectedBookDetails as any).openLibraryKey,
          }}
          onClose={() => setSelectedBookDetails(null)}
          showAddButton={true}
          onAddToLibrary={() => {
            setBookToAdd(selectedBookDetails);
            setSelectedBookDetails(null);
          }}
        />
      )}

      {selectedBookForComments && (
        <BookDetailsModal
          book={{
            id: selectedBookForComments.id,
            title: selectedBookForComments.title,
            author: selectedBookForComments.authors,
            cover_url: selectedBookForComments.thumbnail,
            genre: selectedBookForComments.category,
            total_pages: (selectedBookForComments.pageCount && selectedBookForComments.pageCount > 0) ? selectedBookForComments.pageCount : null,
            description: selectedBookForComments.description || "Chargement...",
            publisher: selectedBookForComments.publisher,
            isbn: selectedBookForComments.isbn,
            google_books_id: selectedBookForComments.id?.startsWith('google:') ? selectedBookForComments.id.replace('google:', '') : (selectedBookForComments as any).google_books_id,
            openLibraryKey: (selectedBookForComments as any).openLibraryKey,
          }}
          onClose={() => {
            setSelectedBookForComments(null);
          }}
          showAddButton={true}
          initialTab="comments"
          focusComment={true}
          onAddToLibrary={() => {
            setBookToAdd(selectedBookForComments);
            setSelectedBookForComments(null);
          }}
        />
      )}

      {likedByBookKey && (
        <BookLikersModal
          bookKey={likedByBookKey}
          bookTitle={likedByTitle}
          onClose={() => {
            setLikedByBookKey(null);
            setLikedByTitle('');
          }}
          onUserClick={(userId) => {
            // TODO: Navigate to user profile
            console.log('[Library] User clicked:', userId);
          }}
        />
      )}

      {bookToAdd && (
        <AddBookStatusModal
          bookTitle={bookToAdd.title}
          onClose={() => {
            setBookToAdd(null);
            setAddingBookId(null);
          }}
          onSelect={async (status) => {
            try {
              // Get total_pages from book if available
              const bookTotalPages = bookToAdd.pageCount || (bookToAdd as any).total_pages || null;
              
              // Always show reading setup modal to collect total_pages if missing
              setPendingBookAdd({ 
                book: bookToAdd, 
                status,
                totalPages: bookTotalPages,
              });
              setBookToAdd(null); // Close status modal
              setShowReadingSetup(true);
            } catch (error) {
              fatalError('Error in onSelect:', error);
            }
          }}
        />
      )}

      {showReadingSetup && pendingBookAdd && (
        <ReadingSetupModal
          open={showReadingSetup}
          bookTitle={pendingBookAdd.book.title}
          initialStatus={pendingBookAdd.status}
          initialTotalPages={pendingBookAdd.totalPages}
          initialCurrentPage={null}
          onCancel={() => {
            setShowReadingSetup(false);
            setPendingBookAdd(null);
          }}
          onConfirm={async (data) => {
            try {
              const result = await handleAddBookToLibrary(
                pendingBookAdd.book,
                data.status,
                data.total_pages,
                data.current_page
              );
              if (result.success) {
                setShowReadingSetup(false);
                setPendingBookAdd(null);
                setAddingBookId(null);
              }
            } catch (error) {
              fatalError('Error adding book:', error);
              setShowReadingSetup(false);
              setPendingBookAdd(null);
            }
          }}
        />
      )}

      {bookToManage && (
        <ManageBookModal
          bookTitle={bookToManage.book?.title || 'Livre'}
          currentStatus={bookToManage.status}
          onClose={() => setBookToManage(null)}
          onDelete={async () => {
            await handleDeleteBook(bookToManage.id);
            setBookToManage(null);
            setToast({ message: 'Livre supprimé avec succès', type: 'success' });
          }}
          onChangeStatus={async (status) => {
            const statusLabels = {
              reading: 'En cours',
              completed: 'Terminé',
              want_to_read: 'À lire',
            };
            await handleChangeBookStatus(bookToManage.id, status);
            setBookToManage(null);
            setToast({ 
              message: `Livre déplacé vers "${statusLabels[status]}"`, 
              type: 'success' 
            });
          }}
          onEdit={() => {
            setBookToEdit({ ...bookToManage, book: bookToManage.book });
            setBookToManage(null);
          }}
        />
      )}

      {showManualAdd && (
        <AddManualBookModal
          onClose={() => {
            setShowManualAdd(false);
          }}
          onAdded={(book) => {
            console.log('[Library] Manual book added, triggering status modal flow:', book);
            setBookToAdd(book as any); // Triggers AddBookStatusModal -> ReadingSetupModal -> handleAddBookToLibrary
            setShowManualAdd(false); // Close manual add modal
          }}
        />
      )}

      {bookToEdit && (
        <EditBookModal
          userBookId={bookToEdit.id}
          initialTitle={(bookToEdit as any).custom_title ?? (bookToEdit.book?.title || '')}
          initialAuthor={(bookToEdit as any).custom_author ?? (bookToEdit.book?.author || '')}
          initialTotalPages={(bookToEdit as any).custom_total_pages ?? (bookToEdit.book?.total_pages || null)}
          initialDescription={(bookToEdit as any).custom_description ?? (bookToEdit.book?.description || '')}
          initialCoverUrl={(bookToEdit as any).custom_cover_url ?? (bookToEdit.book?.cover_url || '')}
          onClose={() => setBookToEdit(null)}
          onSaved={() => {
            loadUserBooks();
          }}
        />
      )}

      {/* Hide FAB when any modal is open */}
      {filter !== 'explore' && !(detailsBookId || showScanner || loadingSelected || selectedDbBook || selectedBookDetails || selectedBookForComments || bookToAdd || bookToManage || showManualAdd || bookToEdit || recapOpen || showReadingSetup) && (
        <button
          onClick={() => {
            setShowManualAdd(true);
          }}
          className="fixed right-6 z-50 w-14 h-14 rounded-full bg-primary text-black shadow-lg flex items-center justify-center hover:brightness-95 transition-all"
          style={{ bottom: 'calc(64px + 16px + env(safe-area-inset-bottom))' }}
          title="Ajouter un livre manuellement"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {recapOpen && recapBook && (
        <BookRecapModal
          open={recapOpen}
          onClose={() => {
            setRecapOpen(false);
            // ✅ Reset le state UI seulement si le défi n'a pas été validé
            if (!recapUI.hasSubmittedChallenge) {
              setRecapUI(DEFAULT_RECAP_UI);
              setRecapTabTouched(false);
            }
            setRecapBook(null);
          }}
          book={recapBook.book}
          uptoPage={recapBook.uptoPage}
          ui={recapUI}
          setUI={setRecapUI}
          onTabChange={(tab) => {
            setRecapTabTouched(true);
            setRecapUI(s => ({ ...s, tab }));
          }}
          loadRecap={loadRecap}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {addCoverBookId && (
        <AddCoverModal
          open={!!addCoverBookId}
          bookId={addCoverBookId}
          bookTitle={addCoverBookTitle}
          onClose={() => {
            setAddCoverBookId(null);
            setAddCoverBookTitle('');
          }}
          onUploaded={(newPath) => {
            // newPath is now always a public URL (not a path)
            // Optimistic update: update UI instantly without navigation
            if (addCoverBookId) {
              setUserBooks(prev => prev.map(ub => 
                ub.book?.id === addCoverBookId 
                  ? { ...ub, custom_cover_url: newPath, updated_at: new Date().toISOString() }
                  : ub
              ));
            }
            // Don't call loadUserBooks - it might change the tab/filter
            // Don't close modal automatically - let user decide
            // The modal will stay open and show the updated cover
          }}
          onShowToast={(message, type) => {
            setToast({ message, type: type || 'info' });
          }}
        />
      )}
    </div>
  );
}
