import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Book, Search as SearchIcon, TrendingUp, Scan, MoreVertical, Plus, Sparkles } from 'lucide-react';
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
import { fetchByIsbn as fetchOpenLibraryByIsbn, searchBooks as searchOpenLibraryBooks, fetchWorkDescription, fetchEditionDescription, generateFallbackSummary, fetchEditionByIsbn, fetchPagesFromBooksApi, fetchCoverUrlWithFallback } from '../services/openLibrary';
import { ensureBookInDB } from '../lib/booksUpsert';
import { getTranslatedDescription } from '../lib/translate';
import { useTranslation } from 'react-i18next';
import { useSwipeTabs } from '../lib/useSwipeTabs';
import { AppHeader } from '../components/AppHeader';
import { fetchOpenLibraryBrowse, OpenLibraryDoc } from '../lib/openLibraryBrowse';
import { getBookSocialCounts, normalizeBookKey, canonicalBookKey, type BookSocialCounts } from '../lib/bookSocial';
import { ExploreGrid } from '../components/ExploreGrid';
import { BookRecapModal } from '../components/BookRecapModal';
import { ReadingSetupModal } from '../components/ReadingSetupModal';
import { normalizeReadingState } from '../lib/readingState';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';

type BookStatus = 'reading' | 'completed' | 'want_to_read';
type FilterType = BookStatus | 'explore';

type UiBook = GoogleBook & {
  openLibraryKey?: string;
};


interface LibraryProps {
  onNavigateToSearch?: () => void;
}

export function Library({}: LibraryProps) {
  const { t, i18n } = useTranslation();
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('reading');
  const [loading, setLoading] = useState(true);
  const [detailsBookId, setDetailsBookId] = useState<string | null>(null);
  const [exploreBooks, setExploreBooks] = useState<OpenLibraryDoc[]>([]);
  const [explorerBooksLoaded, setExplorerBooksLoaded] = useState(false);
  const [hasMoreExplore, setHasMoreExplore] = useState(true);
  const [loadingMoreExplore, setLoadingMoreExplore] = useState(false);
  const [explorerPage, setExplorerPage] = useState(0); // Page number for infinite scroll
  const [exploreSocialCounts, setExploreSocialCounts] = useState<BookSocialCounts>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GoogleBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [booksInLibrary, setBooksInLibrary] = useState<Set<string>>(new Set()); // Track books already in library (by book_id or isbn)
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
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
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapBook, setRecapBook] = useState<{
    book: { id: string; title: string; author?: string; cover_url?: string | null; total_pages?: number | null };
    uptoPage: number;
  } | null>(null);
  const [addCoverBookId, setAddCoverBookId] = useState<string | null>(null);
  const [addCoverBookTitle, setAddCoverBookTitle] = useState<string>('');
  const { user } = useAuth();
  const searchTimeoutRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // Cache mémoire pour fetchOpenLibraryDescription
  const descriptionCacheRef = useRef<Map<string, { value: string | null; expiresAt: number }>>(new Map());
  const DESCRIPTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures (réduit pour limiter IndexedDB)
  // AbortController pour annuler les fetch de description si modal fermé
  const descriptionAbortControllerRef = useRef<AbortController | null>(null);
  // Cooldown pour éviter double triggers dans loadMoreExplorerBooks
  const loadMoreCooldownRef = useRef<number>(0);

  // Swipe horizontal entre tabs
  const tabs = ['reading', 'want_to_read', 'completed', 'explore'] as FilterType[];
  useSwipeTabs({
    tabs,
    currentTab: filter,
    onTabChange: (tab) => setFilter(tab as FilterType),
    threshold: 35,
    verticalThreshold: 1.2,
  });

  // Listen to global book-social-counts-changed event from BookSocial
  // This ensures Explorer cards update instantly when likes/comments change in BookDetailsModal
  useEffect(() => {
    const handleCountsChanged = (event: CustomEvent) => {
      const { bookKey, likes, comments, isLiked } = event.detail;
      if (bookKey && typeof likes === 'number' && typeof comments === 'number') {
        setExploreSocialCounts((prev) => ({
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
  }, []);

  useEffect(() => {
    if (!user) return;

    if (filter === 'explore') {
      // CRITICAL: Do NOT auto-fetch explore books if user is actively searching
      // This prevents spam when user types in search input
      // Only load explorer books if searchQuery is empty and not already loaded
      if ((!searchQuery || searchQuery.trim().length === 0) && !explorerBooksLoaded) {
        loadExplorerBooks(true);
      }
      loadBooksInLibrary(); // Load books in library when switching to explore
    } else {
      loadUserBooks(filter as BookStatus);
    }
  }, [filter, user, searchQuery, explorerBooksLoaded]);

  // Load books in library when component mounts or user changes (for explore tab)
  useEffect(() => {
    if (user && filter === 'explore') {
      loadBooksInLibrary();
    }
  }, [user]);


  // Infinite scroll for Explore tab
  useEffect(() => {
    if (filter !== 'explore') return;
    if (!hasMoreExplore || loadingMoreExplore) return;

    const el = loadMoreRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && !loadingMoreExplore) {
          loadMoreExplorerBooks();
        }
      },
      { root: null, rootMargin: "300px", threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [filter, hasMoreExplore, loadingMoreExplore, exploreBooks.length]);

  const loadUserBooks = async (statusOverride?: BookStatus) => {
    if (!user) return;

    setLoading(true);

    const statusToLoad: BookStatus =
      statusOverride ?? (filter === 'explore' ? 'reading' : (filter as BookStatus));

    const { data, error, status } = await supabase
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
      .eq('status', statusToLoad)
      .order('updated_at', { ascending: false });

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

    // Fallback robuste: si des books sont null, les récupérer en batch
    if (data && data.length > 0) {
      const missingBooks = data.filter(r => !r.book && r.book_id);
      
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
          
          // Remplacer les books null par les données récupérées
          const enrichedData = data.map(userBook => {
            if (!userBook.book && userBook.book_id && booksMap.has(userBook.book_id)) {
              return { ...userBook, book: booksMap.get(userBook.book_id) };
            }
            return userBook;
          });
          
          // Legacy backfill of cover_url removed: we now prefer Open Library cover IDs
          
          debugLog(`Enriched ${missingBooks.length} missing books`);
          setUserBooks(enrichedData);
          setLoading(false);
          return;
        }
      }
      
      // Backfill: update books with missing pages/cover
      const booksToUpdate: Array<{ bookId: string; isbn: string }> = [];
      for (const userBook of data) {
        const book = userBook.book;
        if (book && typeof book === 'object' && !Array.isArray(book)) {
          const bookIsbn = (book as any).isbn;
          const bookCoverUrl = (book as any).cover_url;
          const bookTotalPages = (book as any).total_pages;
          const bookId = (book as any).id;
          
          // Collect books that need backfill (missing pages OR cover, with ISBN)
          if (bookIsbn && bookId && (!bookTotalPages || !bookCoverUrl)) {
            booksToUpdate.push({ bookId, isbn: bookIsbn });
          }
        }
      }
      
      // Run backfill in background (non-blocking)
      if (booksToUpdate.length > 0) {
        console.log(`[Backfill] Found ${booksToUpdate.length} books to update`);
        // Run async without awaiting (fire and forget)
        (async () => {
          for (const { bookId, isbn } of booksToUpdate) {
            try {
              const cleanIsbn = String(isbn).replace(/[-\s]/g, '');
              
              // Fetch edition data
              const editionData = await fetchEditionByIsbn(cleanIsbn);
              
              // Get pages
              let pageCount: number | null = null;
              if (editionData?.pages) {
                pageCount = editionData.pages;
              } else {
                const pagesFromBooksApi = await fetchPagesFromBooksApi(cleanIsbn);
                if (pagesFromBooksApi) {
                  pageCount = pagesFromBooksApi;
                }
              }
              
              // Get cover
              let coverUrl: string | null = null;
              let coverId: number | null = null;
              
              if (editionData?.coverId) {
                coverId = editionData.coverId;
                const coverResult = await fetchCoverUrlWithFallback(coverId, cleanIsbn);
                coverUrl = coverResult.url;
              } else {
                // Try ISBN-based cover
                const coverResult = await fetchCoverUrlWithFallback(undefined, cleanIsbn);
                coverUrl = coverResult.url;
              }
              
              // Fallback to Google Books if still missing
              if (!coverUrl || !pageCount) {
                const googleBook = await searchBookByISBN(cleanIsbn);
                if (googleBook) {
                  if (!coverUrl && googleBook.thumbnail) {
                    coverUrl = googleBook.thumbnail;
                  }
                  if (!pageCount && googleBook.pageCount) {
                    pageCount = googleBook.pageCount;
                  }
                }
              }
              
              // Update book in DB if we found new data
              const updateData: any = {};
              if (pageCount) {
                updateData.total_pages = pageCount;
              }
              if (coverUrl) {
                updateData.cover_url = coverUrl;
              }
              if (coverId) {
                updateData.openlibrary_cover_id = coverId;
              }
              
              if (Object.keys(updateData).length > 0) {
                const { error: updateError } = await supabase
                  .from('books')
                  .update(updateData)
                  .eq('id', bookId);
                
                if (updateError) {
                  console.error(`[Backfill] Error updating book ${bookId}:`, updateError);
                } else {
                  console.log(`[Backfill] Updated book ${bookId} with:`, updateData);
                }
              }
            } catch (err) {
              console.error(`[Backfill] Error processing book ${bookId}:`, err);
            }
          }
        })();
      }
      
      setUserBooks(data);
    } else {
      setUserBooks([]);
    }

    setLoading(false);
  };

  async function fetchOpenLibraryDescription(
    openLibraryKey?: string,
    abortSignal?: AbortSignal
  ): Promise<string | null> {
    if (!openLibraryKey) return null;

    const key = openLibraryKey.startsWith('/') ? openLibraryKey : `/${openLibraryKey}`;
    const cacheKey = key;
    
    // Vérifier le cache
    const cached = descriptionCacheRef.current.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    try {
      // Extraire workId si format "ol:/works/OL123456W" ou "/works/OL123456W"
      let workId = key;
      if (key.includes('/works/')) {
        workId = key.replace('/works/', '').replace(/^\/|\/$/g, '');
      } else if (key.startsWith('/')) {
        workId = key.replace(/^\/|\/$/g, '');
      }
      
      // Utiliser le proxy Supabase Edge Function (évite CORS)
      // Utiliser fetch directement pour supporter AbortSignal
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      
      const response = await fetch(`${supabaseUrl}/functions/v1/openlibrary?workId=${encodeURIComponent(workId)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        signal: abortSignal, // Permet d'annuler le fetch si modal fermé
      });

      if (!response.ok) {
        console.warn('[fetchOpenLibraryDescription] Proxy error:', response.status);
        // Cache l'échec pour éviter de retenter immédiatement
        descriptionCacheRef.current.set(cacheKey, { 
          value: null, 
          expiresAt: Date.now() + 60 * 60 * 1000 // 1h pour les échecs
        });
        return null;
      }

      const data = await response.json();
      const description = data?.description || null;

      // Mettre en cache le résultat (24h pour succès, 1h pour échec)
      descriptionCacheRef.current.set(cacheKey, {
        value: description,
        expiresAt: Date.now() + DESCRIPTION_CACHE_TTL_MS,
      });

      return description;
    } catch (error: any) {
      // Ignorer les erreurs d'abort (utilisateur a fermé la modal)
      if (error?.name === 'AbortError') {
        return null;
      }
      
      console.warn('[fetchOpenLibraryDescription] Error:', error);
      // Cache l'erreur pour éviter de retenter immédiatement
      descriptionCacheRef.current.set(cacheKey, { 
        value: null, 
        expiresAt: Date.now() + 60 * 60 * 1000 // 1h pour les erreurs
      });
      return null;
    }
  }


  const loadExplorerBooks = async (reset: boolean = false) => {
    // Ensure Explorer does NOT run while user is typing
    if (searchQuery && searchQuery.trim().length >= 2) {
      return;
    }
    
    // Protection contre double fetch
    if (loadingMoreExplore) {
      return;
    }

    const LIMIT = 20;
    const currentPage = reset ? 0 : explorerPage;

    if (reset) {
      setExploreBooks([]);
      setExplorerBooksLoaded(false);
      setHasMoreExplore(true);
      setExplorerPage(0);
    }

    // Mark as loading only if not already loaded
    if (!explorerBooksLoaded || reset) {
      if (reset && exploreBooks.length === 0) {
        // Premier render: pas de setLoading pour affichage instantané
      } else {
        setLoading(true);
      }
    }

    try {
      // Fetch books from OpenLibrary browse
      const newBooks = await fetchOpenLibraryBrowse(currentPage, LIMIT);

      if (newBooks.length === 0) {
        // No more books
        setHasMoreExplore(false);
        setExplorerBooksLoaded(true);
        setLoading(false);
        setLoadingMoreExplore(false);
        return;
      }

      // Deduplicate before append (by id or key)
      setExploreBooks(prev => {
        const base = reset ? [] : prev;
        const existingIds = new Set(base.map((x: OpenLibraryDoc) => x.id));
        const existingKeys = new Set(
          base
            .map((x: OpenLibraryDoc) => x.key)
            .filter((x): x is string => !!x)
        );
        
        const deduped = newBooks.filter((x: OpenLibraryDoc) => {
          if (existingIds.has(x.id)) return false;
          if (x.key && existingKeys.has(x.key)) return false;
          return true;
        });
        
        return [...base, ...deduped];
      });

      setExplorerBooksLoaded(true);
      setHasMoreExplore(newBooks.length === LIMIT); // More pages if we got a full page
      setExplorerPage(currentPage + 1);

      // Disable loading immediately
      setLoading(false);
      
      // Load social counts for new books using canonical keys
      if (newBooks.length > 0) {
        // Convert OpenLibraryDoc to format compatible with canonicalBookKey
        const bookKeys = newBooks
          .map(book => {
            // Handle ISBN as string or array (OpenLibrary often returns array)
            const isbn = Array.isArray(book.isbn) ? book.isbn[0] : book.isbn;
            const bookForCanonical = {
              id: book.key || book.id,
              key: book.key,
              isbn: isbn,
              isbn13: isbn,
              isbn10: isbn,
              openLibraryKey: book.key,
            };
            return canonicalBookKey(bookForCanonical);
          })
          .filter((key): key is string => !!key && key !== 'unknown');
        
        if (bookKeys.length > 0) {
          const newBookKeys = bookKeys.filter(key => !exploreSocialCounts[key]);
          if (newBookKeys.length > 0) {
            try {
              const counts = await getBookSocialCounts(newBookKeys, user?.id);
              setExploreSocialCounts((prev: BookSocialCounts) => ({ ...prev, ...counts }));
            } catch (error) {
              console.warn('Error loading explore social counts:', error);
            }
          }
        }
      }
    } catch (error) {
      fatalError('Unexpected error loading explorer books:', error);
      setHasMoreExplore(false);
      if (reset || !explorerBooksLoaded) {
        setExploreBooks([]);
      }
      setLoading(false);
    } finally {
      setLoadingMoreExplore(false);
    }
  };



  const loadMoreExplorerBooks = async () => {
    if (loadingMoreExplore || !hasMoreExplore) return;
    
    // FIX: Cooldown 300ms pour éviter double triggers
    const now = Date.now();
    if (now - loadMoreCooldownRef.current < 300) {
      console.log('[Library] loadMoreExplorerBooks: cooldown active, skipping');
      return;
    }
    loadMoreCooldownRef.current = now;
    
    setLoadingMoreExplore(true);
    await loadExplorerBooks(false);
  };

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
        .select('id, title, author, isbn, cover_url, total_pages, description, google_books_id, openlibrary_work_key, openlibrary_edition_key')
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

      // BONUS: If description is null/empty, try to fetch fallback description from multiple sources
      if (!dbBook.description || dbBook.description.trim().length === 0) {
        let foundDescription: string | null = null;

        // Priority 1: Try to get description from original book object (Google Books)
        if (book.description && book.description.trim().length > 0) {
          foundDescription = book.description.trim();
        }
        
        // Priority 2: Try OpenLibrary Work API if we have work key
        if (!foundDescription && dbBook.openlibrary_work_key) {
          try {
            const olDesc = await fetchWorkDescription(dbBook.openlibrary_work_key);
            if (olDesc && olDesc.length > 0) {
              foundDescription = olDesc;
            }
          } catch (error) {
            console.log('[Library Explorer openDetails] Could not fetch OpenLibrary work description:', error);
          }
        }

        // Priority 3: Try OpenLibrary Edition API if we have edition key
        if (!foundDescription && dbBook.openlibrary_edition_key) {
          try {
            const olDesc = await fetchEditionDescription(dbBook.openlibrary_edition_key);
            if (olDesc && olDesc.length > 0) {
              foundDescription = olDesc;
            }
          } catch (error) {
            console.log('[Library Explorer openDetails] Could not fetch OpenLibrary edition description:', error);
          }
        }

        // Priority 4: Try to fetch from Google Books API if we have google_books_id
        if (!foundDescription && dbBook.google_books_id) {
          try {
            const googleBook = await searchGoogleBooks(dbBook.title, undefined, 0, 1);
            if (googleBook && googleBook.length > 0 && googleBook[0].description) {
              const desc = googleBook[0].description.trim();
              if (desc.length > 0) {
                foundDescription = desc;
              }
            }
          } catch (error) {
            console.log('[Library Explorer openDetails] Could not fetch Google Books description:', error);
          }
        }

        // Priority 5: Try OpenLibrary by ISBN if we have ISBN but no work key
        if (!foundDescription && dbBook.isbn && !dbBook.openlibrary_work_key) {
          try {
            const olBook = await fetchOpenLibraryByIsbn(dbBook.isbn);
            if (olBook?.openLibraryWorkKey) {
              // Save work key for future use
              await supabase
                .from('books')
                .update({ openlibrary_work_key: olBook.openLibraryWorkKey.startsWith('/') ? olBook.openLibraryWorkKey : `/works/${olBook.openLibraryWorkKey}` })
                .eq('id', dbBookId);
              
              // Try to fetch description from work
              if (olBook.openLibraryWorkKey) {
                const olDesc = await fetchWorkDescription(olBook.openLibraryWorkKey);
                if (olDesc && olDesc.length > 0) {
                  foundDescription = olDesc;
                }
              }
            }
          } catch (error) {
            console.log('[Library Explorer openDetails] Could not fetch OpenLibrary by ISBN:', error);
          }
        }

        // Update DB if we found a description
        if (foundDescription && foundDescription.length > 0) {
          await supabase
            .from('books')
            .update({ description: foundDescription })
            .eq('id', dbBookId);
          dbBook.description = foundDescription;
        } else {
          // Fallback: Generate mini-summary
          const fallback = generateFallbackSummary({
            title: dbBook.title,
            author: dbBook.author,
            total_pages: dbBook.total_pages,
            category: (book as any).category,
            genre: (book as any).genre,
          });
          dbBook.description = fallback;
        }
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
        // If query is empty, reload browse books
        if (query.trim().length === 0) {
          // Reset search results and reload browse
          setSearchResults([]);
          if (!explorerBooksLoaded || exploreBooks.length === 0) {
            loadExplorerBooks(true);
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

      // Anti-spam rule: Only create activity if pages_delta > 1
      // This prevents creating activities for small adjustments (+1 page) during setup
      // For new books, old current_page is 0, so pages_delta = new_current_page - 0 = new_current_page
      // We only create activity if new_current_page > 1 (i.e., pages_delta > 1)
      if (normalizedState.status === 'reading' && normalizedState.current_page > 1) {
        try {
          // Get book title for activity title
          const bookTitle = finalRow?.book?.title || book.title || 'Livre';
          
          // Create a bootstrap activity to count initial pages in stats
          // This is a minimal activity just to bootstrap the page count
          // Only created if pages_delta > 1 to avoid spam
          const { error: activityError } = await supabase
            .from('activities')
            .insert({
              user_id: userId,
              type: 'reading',
              title: `Lecture de ${bookTitle}`,
              book_id: bookId,
              pages_read: normalizedState.current_page,
              duration_minutes: 0, // No duration for bootstrap
              visibility: 'public', // Public so it appears in followers' feeds
            });

          if (activityError) {
            console.error('[handleAddBookToLibrary] Error creating bootstrap activity:', activityError);
            // Don't fail the whole operation if bootstrap activity fails
          } else {
            // Update user_profiles.total_pages_read
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('total_pages_read')
              .eq('id', userId)
              .maybeSingle();

            if (profile) {
                 await supabase
                   .from('user_profiles')
                   .update({
                     total_pages_read: (profile.total_pages_read || 0) + normalizedState.current_page,
                   })
                   .eq('id', userId);
            }
          }
        } catch (bootstrapError) {
          console.error('[handleAddBookToLibrary] Error in bootstrap activity creation:', bootstrapError);
          // Don't fail the whole operation if bootstrap fails
        }
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
      console.error('[handleAddBookToLibrary] UNEXPECTED ERROR', {
        error,
        message: error?.message,
        code: error?.code,
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

  const handleChangeBookStatus = async (userBookId: string, newStatus: BookStatus) => {
    if (!user) return;

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

  return (
    <div className="h-screen max-w-2xl mx-auto font-sans text-neutral-900 overflow-hidden" style={{ isolation: 'isolate' }}>
      {/* Fixed Header - now truly fixed via AppHeader component */}
      <AppHeader
        title={t('library.title')}
        rightActions={
          <button
            onClick={() => setShowScanner(true)}
            className="p-2.5 bg-primary text-black rounded-xl hover:brightness-95 transition-all shadow-sm"
            title="Scanner un code-barres"
          >
            <Scan className="w-5 h-5" />
          </button>
        }
      />
      
      {/* Fixed Search + Tabs section (below header) */}
      <div 
        className="fixed left-0 right-0 bg-white border-b border-gray-100 z-40"
        style={{
          top: 'calc(56px + env(safe-area-inset-top))', // Below AppHeader
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
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar">
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
        className="h-full overflow-y-auto"
        style={{
          paddingTop: 'calc(136px + env(safe-area-inset-top))', // Header (56px) + Search/Tabs section (~80px: py-3 + input + buttons)
          paddingBottom: `calc(${TABBAR_HEIGHT}px + env(safe-area-inset-bottom) + 32px)`,
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y', // Allow vertical panning only
        }}
      >
        <div 
          className="p-4 no-scrollbar"
          style={{
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
        ) : !searchQuery && filter === 'explore' ? (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold tracking-tight mb-2 text-text-main-light">{t('library.explore')}</h2>
              <p className="text-xs text-black/50 mb-6">Découvrez des livres populaires français</p>
            </div>

            {/* Afficher tous les livres immédiatement (même sans cover) */}
            {/* Skeleton UNIQUEMENT lors du chargement de la page suivante (loadingMoreExplore) */}
            {exploreBooks.length === 0 && loadingMoreExplore ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={`skeleton-${i}`} className="flex flex-col rounded-2xl bg-white border border-black/5 p-2 shadow-[0_1px_10px_rgba(0,0,0,0.04)] overflow-hidden animate-pulse">
                    <div className="w-full aspect-[2/3] bg-gray-200 rounded-2xl mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded mb-1"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            ) : exploreBooks.length > 0 ? (
              <>
                <ExploreGrid
                  exploreBooks={exploreBooks}
                  exploreSocialCounts={exploreSocialCounts}
                  booksInLibrary={booksInLibrary}
                  addingBookId={addingBookId}
                  isBookInLibrary={isBookInLibrary}
                  onOpenDetails={openExplorerDetails}
                  onAddToLibrary={(book) => setBookToAdd(book)}
                  onCountsChange={(bookKey, nextLikes, nextComments, nextLiked) => {
                    setExploreSocialCounts((prev) => ({
                      ...prev,
                      [bookKey]: { 
                        likes: nextLikes, 
                        comments: nextComments,
                        isLiked: nextLiked,
                      },
                    }));
                  }}
                  onOpenComments={(book) => setSelectedBookForComments(book)}
                  onShowToast={(message, type = 'info') => setToast({ message, type })}
                />

                {/* Infinite scroll sentinel */}
                {hasMoreExplore && (
                  <div ref={loadMoreRef} className="h-12 flex items-center justify-center">
                    {loadingMoreExplore && <span className="text-xs text-black/40">Chargement...</span>}
                  </div>
                )}
              </>
            ) : null}
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

                return (
                  <div
                    key={userBook.id}
                    className="flex gap-4 p-4 bg-card-light rounded-xl shadow-sm border border-gray-200 relative overflow-hidden"
                  >
                  <button
                    onClick={() => setBookToManage({ ...userBook, book })}
                    className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecapBook({
                        book: {
                          id: book.id,
                          title: book.title,
                          author: book.author,
                          cover_url: book.cover_url,
                          total_pages: book.total_pages,
                        },
                        uptoPage: userBook.current_page || 0,
                      });
                      setRecapOpen(true);
                    }}
                    className="absolute bottom-3 right-3 px-3 py-1.5 bg-stone-900 text-white text-xs font-semibold rounded-lg hover:brightness-95 transition-colors z-10 flex items-center gap-1.5"
                    title="Résumé IA"
                  >
                    <Sparkles className="w-3 h-3" />
                    IA
                  </button>

                  <div
                    onClick={() => setDetailsBookId(book.id)}
                    className="cursor-pointer hover:scale-105 transition-transform"
                  >
                    <BookCover
                      custom_cover_url={(userBook as any).custom_cover_url || null}
                      coverUrl={book.cover_url || null}
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

                  <div className="flex-1 min-w-0 pr-8">
                    <h3 className="font-bold text-text-main-light mb-1 line-clamp-2">{displayTitle}</h3>
                    <p className="text-sm text-text-sub-light mb-2 truncate">{displayAuthor}</p>

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
                setRecapBook({
                  book: {
                    id: userBook.book.id,
                    title: userBook.book.title,
                    author: userBook.book.author,
                    cover_url: userBook.book.cover_url,
                    total_pages: userBook.book.total_pages,
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
            // Annuler le fetch en cours si modal fermé
            if (descriptionAbortControllerRef.current) {
              descriptionAbortControllerRef.current.abort();
              descriptionAbortControllerRef.current = null;
            }
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
          onAdded={() => {
            loadUserBooks();
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
            setRecapBook(null);
          }}
          book={recapBook.book}
          uptoPage={recapBook.uptoPage}
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
          onUploaded={(newUrl) => {
            // Reload user books to refresh custom cover
            loadUserBooks();
            setAddCoverBookId(null);
            setAddCoverBookTitle('');
          }}
          onShowToast={(message, type) => {
            setToast({ message, type: type || 'info' });
          }}
        />
      )}
    </div>
  );
}
