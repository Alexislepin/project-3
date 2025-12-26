import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Book, Search as SearchIcon, TrendingUp, Scan, MoreVertical, Plus } from 'lucide-react';
import { BookDetailsWithManagement } from '../components/BookDetailsWithManagement';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { AddBookStatusModal } from '../components/AddBookStatusModal';
import { ManageBookModal } from '../components/ManageBookModal';
import { EditBookModal } from '../components/EditBookModal';
import { AddManualBookModal } from '../components/AddManualBookModal';
import { BookCover } from '../components/BookCover';
import { Toast } from '../components/Toast';
import { debugLog, debugWarn, fatalError } from '../utils/logger';
import { searchBookByISBN, searchBooks as searchGoogleBooks, Book as GoogleBook } from '../lib/googleBooks';
import { fetchByIsbn as fetchOpenLibraryByIsbn } from '../services/openLibrary';
import { ensureBookInDB } from '../lib/booksUpsert';
import { useSwipeTabs } from '../lib/useSwipeTabs';
import { AppHeader } from '../components/AppHeader';
import { fetchOpenLibraryBrowse, OpenLibraryDoc } from '../lib/openLibraryBrowse';
import { getBookKey, getBookSocialCounts, type BookSocialCounts } from '../lib/bookSocial';

type BookStatus = 'reading' | 'completed' | 'want_to_read';
type FilterType = BookStatus | 'explore';

type UiBook = GoogleBook & {
  openLibraryKey?: string;
};


interface LibraryProps {
  onNavigateToSearch?: () => void;
}

export function Library({}: LibraryProps) {
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
  const [selectedBookDetails, setSelectedBookDetails] = useState<GoogleBook | null>(null);
  const [selectedBookForComments, setSelectedBookForComments] = useState<GoogleBook | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
  const { user } = useAuth();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      
      // Legacy backfill: previously updated cover_url via ISBN; we now skip this
      for (const userBook of data) {
        const book = userBook.book;
        if (book && typeof book === 'object' && !Array.isArray(book)) {
          const bookIsbn = (book as any).isbn;
          const bookCoverUrl = (book as any).cover_url;
          const bookId = (book as any).id;
          
          if (bookIsbn && !bookCoverUrl && bookId) {
            // No-op: we don't auto-populate cover_url anymore
          }
        }
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
      
      // Load social counts for new books
      if (newBooks.length > 0) {
        const bookKeys = newBooks
          .map(book => {
            // Convert OpenLibraryDoc to format for getBookKey
            const bookForKey = {
              id: book.key || book.id,
              key: book.key,
              isbn13: book.isbn,
              isbn10: book.isbn,
              isbn: book.isbn,
              title: book.title,
              author: book.authors,
            };
            return getBookKey(bookForKey);
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

  const getProgress = (currentPage: number, totalPages: number) => {
    if (!totalPages) return 0;
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

    // For "explore" tab: no search (Explorer is browse-only)
    if (filter === 'explore') {
      setSearchResults([]);
      setSearching(false);
      setRateLimitError(false);
      return;
    }
  };

  const handleAddBookToLibrary = async (book: GoogleBook | UiBook, status: BookStatus): Promise<{ success: boolean; alreadyExists: boolean }> => {
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

      // Step 3: Upsert into user_books
      const { data: insertedRows, error: insertError } = await supabase
        .from('user_books')
        .upsert({
          user_id: userId,
          book_id: bookId,
          status: status,
          current_page: 0,
        }, {
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
            const statusLabel = existingRow.status === 'reading' ? 'En cours' : 
                               existingRow.status === 'completed' ? 'Terminé' : 
                               'À lire';
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

      // Mise à jour immédiate de l'UI sans reload
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

              // Update booksInLibrary set after successful add (for explore tab)
              if (filter === 'explore') {
                await loadBooksInLibrary();
              }

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
      if (olBook && olBook.title && olBook.authors) {
        const googleBookFromOl: GoogleBook = {
          id: olBook.isbn13 || olBook.isbn10 || cleanIsbn,
          title: olBook.title,
          authors: olBook.authors,
          category: undefined,
          pageCount: undefined,
          publisher: undefined,
          isbn: olBook.isbn13 || olBook.isbn10 || cleanIsbn,
          description: olBook.description,
          thumbnail: olBook.coverUrl,
          isbn13: olBook.isbn13,
          isbn10: olBook.isbn10,
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
    <div className="max-w-2xl mx-auto font-sans text-neutral-900" style={{ isolation: 'isolate' }}>
      <AppHeader
        title="Ma Bibliothèque"
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
      
      <div className="px-4 py-3 bg-white border-b border-gray-100">
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

      <div className="p-4 no-scrollbar">
        {searching && !searchQuery && (
          <div className="mb-6">
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
              <div className="text-text-sub-light">Recherche du livre...</div>
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

                        <div className="flex flex-col flex-1 mt-2">
                          <h3 className="text-[13px] font-semibold leading-snug line-clamp-2">{book.title}</h3>
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
                              onClick={() => setDetailsBookId(book.id)}
                              className="mt-2 w-full rounded-xl bg-gray-100 text-text-main-light py-2 text-[12px] font-medium hover:bg-gray-200 transition"
                            >
                              Voir les détails
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
              <h2 className="text-lg font-semibold tracking-tight mb-2 text-text-main-light">Explorer</h2>
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
                <div className="grid grid-cols-2 gap-3">
                  {exploreBooks.map((book, index) => {
                    // Convert OpenLibraryDoc to GoogleBook for modals and actions
                    const googleBookConverted: GoogleBook = {
                      id: book.key || book.id,
                      title: book.title,
                      authors: book.authors,
                      thumbnail: book.cover_i 
                        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg?default=false` 
                        : undefined,
                      isbn: book.isbn,
                      isbn13: book.isbn,
                      isbn10: book.isbn,
                    };
                    
                    // Book object for getBookKey and actions
                    const bookForActions = {
                      id: book.key || book.id,
                      key: book.key,
                      isbn13: book.isbn,
                      isbn10: book.isbn,
                      isbn: book.isbn,
                      title: book.title,
                      author: book.authors,
                      cover_url: googleBookConverted.thumbnail,
                    };
                    
                    const bookKey = getBookKey(bookForActions);
                    const alreadyAdded = isBookInLibrary(googleBookConverted);
                    const socialCounts = exploreSocialCounts[bookKey] || { likes: 0, comments: 0, isLiked: false };
                    const isLiked = socialCounts.isLiked ?? false;
                    
                    // Generate stable key: id || title-index
                    const stableKey = book.id || `${book.title}-${index}`;
                    
                    return (
                      <div
                        key={stableKey}
                        className="flex flex-col rounded-2xl bg-white border border-black/5 p-2 shadow-[0_1px_10px_rgba(0,0,0,0.04)] overflow-hidden"
                      >
                        <div 
                          className="relative cursor-pointer rounded-2xl overflow-hidden bg-neutral-100 shadow-[0_10px_25px_rgba(0,0,0,0.10)]"
                          onClick={() => {
                            setSelectedBookDetails(googleBookConverted);
                          }}
                        >
                          <BookCover
                            title={book.title}
                            author={book.authors}
                            cover_i={book.cover_i || null}
                            className="w-full aspect-[2/3] bg-neutral-100"
                            showQuickActions={true}
                            book={bookForActions}
                            likes={socialCounts.likes}
                            comments={socialCounts.comments}
                            isLiked={isLiked}
                            onCountsChange={(nextLikes, nextComments, nextLiked) => {
                              setExploreSocialCounts((prev) => ({
                                ...prev,
                                [bookKey]: { 
                                  likes: nextLikes, 
                                  comments: nextComments,
                                  isLiked: nextLiked ?? isLiked,
                                },
                              }));
                            }}
                            onOpenComments={() => {
                              setSelectedBookForComments(googleBookConverted);
                            }}
                            onShowToast={(message, type = 'info') => {
                              setToast({ message, type });
                            }}
                          />
                        </div>

                        <div className="flex flex-col flex-1 mt-2">
                          <h3 
                            className="text-[13px] font-semibold leading-snug line-clamp-2 cursor-pointer hover:text-primary"
                            onClick={() => {
                              setSelectedBookDetails(googleBookConverted);
                            }}
                          >
                            {book.title}
                          </h3>
                          <p className="text-[11px] text-black/50 line-clamp-1">{book.authors}</p>

                          {alreadyAdded ? (
                            <button
                              disabled
                              className="mt-2 w-full rounded-xl bg-gray-200 text-gray-600 py-2 text-[12px] font-medium disabled:opacity-60"
                            >
                              Déjà ajouté
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setBookToAdd(googleBookConverted);
                              }}
                              disabled={addingBookId === book.id}
                              className="mt-2 w-full rounded-xl bg-black text-white py-2 text-[12px] font-medium active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {addingBookId === book.id ? 'Ajout en cours...' : 'Ajouter'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

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
              {filter === 'reading' && 'Aucun livre en cours'}
              {filter === 'want_to_read' && 'Aucun livre à lire'}
              {filter === 'completed' && 'Aucun livre terminé'}
            </p>
            <p className="text-sm text-text-sub-light mb-4">
              Envie de découvrir de nouveaux livres?
            </p>
            <button
              onClick={() => setFilter('explore')}
              className="px-6 py-3 bg-primary text-black rounded-xl font-bold hover:brightness-95 transition-all inline-flex items-center gap-2"
            >
              <TrendingUp className="w-5 h-5" />
              Explorer
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
              const progress = getProgress(userBook.current_page, book.total_pages || 0);
              const displayTitle = book.title;
              const displayAuthor = book.author;
              const displayPages = book.total_pages || 0;

              // Use book.cover_url
              const displayCover: string | null = book.cover_url || null;

                return (
                  <div
                    key={userBook.id}
                    className="flex gap-4 p-4 bg-card-light rounded-xl shadow-sm border border-gray-200 relative overflow-hidden"
                  >
                  <button
                    onClick={() => setBookToManage({ ...userBook, book })}
                    className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  <div
                    onClick={() => setDetailsBookId(book.id)}
                    className="cursor-pointer hover:scale-105 transition-transform"
                  >
                    <BookCover
                      coverUrl={displayCover}
                      title={displayTitle}
                      author={displayAuthor || 'Auteur inconnu'}
                      isbn={(book as any).isbn || null}
                      isbn13={(book as any).isbn13 || null}
                      isbn10={(book as any).isbn10 || null}
                      className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-md"
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
                            {userBook.current_page} / {displayPages} pages
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
                      {displayPages > 0 && (
                        <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
                          {displayPages} pages
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

      {detailsBookId && (
        <BookDetailsWithManagement
          bookId={detailsBookId}
          onClose={() => {
            setDetailsBookId(null);
            loadUserBooks();
          }}
        />
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
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
            total_pages: selectedBookDetails.pageCount || 0,
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
            total_pages: selectedBookForComments.pageCount || 0,
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
              const result = await handleAddBookToLibrary(bookToAdd, status);
              // Close modal only on success (whether already exists or newly added)
              if (result.success) {
                setBookToAdd(null);
                setAddingBookId(null);
              }
              // If error, modal stays open for retry
            } catch (error) {
              fatalError('Error in onSelect:', error);
              // Don't close modal on error - let user retry
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
          initialTitle={bookToEdit.book?.title || ''}
          initialAuthor={bookToEdit.book?.author || ''}
          initialTotalPages={bookToEdit.book?.total_pages || null}
          initialDescription={bookToEdit.book?.description || ''}
          initialCoverUrl={bookToEdit.book?.cover_url || ''}
          onClose={() => setBookToEdit(null)}
          onSaved={() => {
            loadUserBooks();
          }}
        />
      )}

      {filter !== 'explore' && (
        <button
          onClick={() => {
            setShowManualAdd(true);
          }}
          className="fixed right-6 bottom-[110px] z-50 w-14 h-14 rounded-full bg-primary text-black shadow-lg flex items-center justify-center hover:brightness-95 transition-all"
          title="Ajouter un livre manuellement"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
