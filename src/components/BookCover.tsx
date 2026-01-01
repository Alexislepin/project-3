import { useState, useEffect, useRef, useMemo } from "react";
import { Camera } from "lucide-react";
import { BookQuickActions } from "./BookQuickActions";
import { supabase } from "../lib/supabase";
import { addCacheBuster } from "../lib/resolveImageUrl";

// Cache mémoire global pour les covers (évite de retenter les URLs qui ont échoué)
const coverCache = new Map<string, { ok: boolean; ts: number }>();
const COVER_CACHE_TTL_OK_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours pour les covers valides
const COVER_CACHE_TTL_FAIL_MS = 12 * 60 * 60 * 1000; // 12 heures pour les échecs
const COVER_TIMEOUT_MS = 25000; // 25 secondes pour tester une URL cover (augmenté pour 4G lente)

// Flag DEBUG pour calmer les logs
const DEBUG = import.meta.env.DEV && false; // mets true quand tu debug
const log = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};

type BookCoverProps = {
  title: string;
  author?: string;
  coverUrl?: string | null; // Initial cover URL (can be from any source)
  custom_cover_url?: string | null; // User-specific custom cover (highest priority)
  customCoverUrl?: string | null; // Alias for custom_cover_url (for compatibility)
  cacheKey?: string; // Cache-busting key (e.g., updated_at timestamp)
  isbn?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  cover_i?: number | null; // OpenLibrary cover ID (most reliable)
  openlibrary_cover_id?: number | null; // Alias for cover_i
  googleCoverUrl?: string | null; // Google Books thumbnail/smallThumbnail
  className?: string;
  likes?: number;
  comments?: number;
  book?: any; // Full book object for quick actions
  isLiked?: boolean; // Whether current user has liked this book
  onCountsChange?: (nextLikes: number, nextComments: number, nextLiked: boolean) => void;
  onOpenComments?: () => void;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  showQuickActions?: boolean; // Whether to show quick actions buttons
  onCoverLoaded?: (url: string, source: string) => void; // Callback when a valid cover is loaded
  onAddCover?: () => void; // Callback when user wants to add a custom cover
  bookId?: string; // Book ID for custom cover upload
  showAddCoverButton?: boolean; // Whether to show "Add cover" button when placeholder
};

type CoverSource = 
  | { type: 'openlibrary_id'; url: string }
  | { type: 'openlibrary_isbn'; url: string }
  | { type: 'google'; url: string }
  | { type: 'initial'; url: string }
  | { type: 'placeholder'; url: string };

export function BookCover({
  title,
  author,
  coverUrl,
  custom_cover_url,
  customCoverUrl,
  cacheKey,
  openlibrary_cover_id,
  className = "",
  likes = 0,
  comments = 0,
  book,
  isLiked = false,
  onCountsChange,
  onOpenComments,
  onShowToast,
  showQuickActions = false,
  isbn,
  isbn13,
  isbn10,
  cover_i,
  googleCoverUrl,
  onCoverLoaded,
  onAddCover,
  bookId,
  showAddCoverButton = false,
}: BookCoverProps) {
  // Get custom cover URL (support both prop names)
  const customCover = custom_cover_url ?? customCoverUrl ?? null;
  
  /**
   * Resolve cover URL: converts storage path to public URL if needed
   * Rejects local URIs (file://, capacitor://) and returns null
   */
  const resolveCoverUrl = (input: string | null): string | null => {
    if (!input) return null;
    
    // Reject local URIs - these should never be stored in DB
    if (input.startsWith('file://') || input.startsWith('capacitor://')) {
      console.warn('[BookCover] Rejected local URI:', input);
      return null;
    }
    
    // If it's already an HTTP(S) URL, use it directly
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return input;
    }
    
    // Otherwise, treat it as a storage path and resolve to public URL
    const { data } = supabase.storage.from('book-covers').getPublicUrl(input);
    return data?.publicUrl || null;
  };
  
  // Resolve custom cover (path -> URL if needed)
  const resolvedCustomCover = resolveCoverUrl(customCover);
  
  // Add cache-buster
  const bustedCustomCover = addCacheBuster(resolvedCustomCover, cacheKey);
  // Refs pour éviter les reloads inutiles et le "despawn"
  const resolvedSrcRef = useRef<string | null>(null);
  const lastIdentityRef = useRef<string>('');
  const reqIdRef = useRef(0);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // State pour l'affichage
  const [imgSrc, setImgSrc] = useState<string>('/placeholder-cover.svg');
  
  // Construire une identity stable (UNIQUEMENT sur ce qui change vraiment l'image)
  // Include cacheKey so cache-buster changes trigger reload
  const identity = useMemo(() => {
    return [
      bustedCustomCover || '',
      coverUrl || '',
      isbn13 || '',
      isbn10 || '',
      isbn || '',
      cover_i ? String(cover_i) : '',
      openlibrary_cover_id ? String(openlibrary_cover_id) : '',
      googleCoverUrl || '',
      cacheKey || '',
    ].join('|');
  }, [bustedCustomCover, coverUrl, isbn13, isbn10, isbn, cover_i, openlibrary_cover_id, googleCoverUrl, cacheKey]);

  // Helper: vérifier si une URL contient archive.org (interdit)
  const isArchiveOrgUrl = (url: string): boolean => {
    return url.includes('archive.org');
  };

  // Build fallback sources in priority order
  const buildSources = (): CoverSource[] => {
    const sourcesList: CoverSource[] = [];

    // Priority 1: Custom cover URL (user-specific manual cover) - HIGHEST PRIORITY
    // If custom cover exists, use it DIRECTLY and DO NOT attempt OpenLibrary/Google fallbacks
    if (bustedCustomCover && bustedCustomCover.trim().length > 0 && !isArchiveOrgUrl(bustedCustomCover)) {
      const url = bustedCustomCover.trim();
      // For custom covers, skip cache check (always use the URL directly)
      sourcesList.push({ type: 'initial', url });
      // Return early - don't add any fallback sources
      return sourcesList;
    }

    // Priority 2: Cover URL from books table
    if (coverUrl && !isArchiveOrgUrl(coverUrl)) {
      const isDuplicate = sourcesList.some(s => s.url === coverUrl);
      if (!isDuplicate) {
        const cached = coverCache.get(coverUrl);
        const now = Date.now();
        if (!cached || (cached.ok && (now - cached.ts) < COVER_CACHE_TTL_OK_MS)) {
          sourcesList.push({ type: 'initial', url: coverUrl });
        } else if (cached && !cached.ok && (now - cached.ts) < COVER_CACHE_TTL_FAIL_MS) {
          log(`[BookCover] ${title}: Skipping cached fail - ${coverUrl}`);
        }
      }
    }

    // Priority 3: OpenLibrary cover_i or openlibrary_cover_id
    const coverId = cover_i || openlibrary_cover_id;
    if (typeof coverId === 'number' && coverId > 0) {
      const url = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`;
      const cached = coverCache.get(url);
      const now = Date.now();
      if (!cached || (cached.ok && (now - cached.ts) < COVER_CACHE_TTL_OK_MS)) {
        sourcesList.push({ type: 'openlibrary_id', url });
      } else if (cached && !cached.ok && (now - cached.ts) < COVER_CACHE_TTL_FAIL_MS) {
        log(`[BookCover] ${title}: Skipping cached fail - ${url}`);
      }
    }

    // Priority 4: OpenLibrary ISBN
    const isbnToUse = isbn13 || isbn10 || isbn;
    if (isbnToUse) {
      const cleanIsbn = String(isbnToUse).replace(/[-\s]/g, '');
      if (cleanIsbn.length >= 10) {
        const url = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
        const cached = coverCache.get(url);
        const now = Date.now();
        if (!cached || (cached.ok && (now - cached.ts) < COVER_CACHE_TTL_OK_MS)) {
          sourcesList.push({ type: 'openlibrary_isbn', url });
        } else if (cached && !cached.ok && (now - cached.ts) < COVER_CACHE_TTL_FAIL_MS) {
          log(`[BookCover] ${title}: Skipping cached fail - ${url}`);
        }
      }
    }

    // Priority 5: Google Books cover
    if (googleCoverUrl && !isArchiveOrgUrl(googleCoverUrl)) {
      const cached = coverCache.get(googleCoverUrl);
      const now = Date.now();
      if (!cached || (cached.ok && (now - cached.ts) < COVER_CACHE_TTL_OK_MS)) {
        sourcesList.push({ type: 'google', url: googleCoverUrl });
      } else if (cached && !cached.ok && (now - cached.ts) < COVER_CACHE_TTL_FAIL_MS) {
        log(`[BookCover] ${title}: Skipping cached fail - ${googleCoverUrl}`);
      }
    }

    // Priority 6: Placeholder (always last)
    sourcesList.push({ type: 'placeholder', url: '/placeholder-cover.svg' });

    return sourcesList;
  };

  // Main effect: charger l'image uniquement si identity change
  useEffect(() => {
    const reqId = ++reqIdRef.current;

    // If we have a custom cover, use it directly without fallback logic
    if (bustedCustomCover && bustedCustomCover.trim().length > 0 && !isArchiveOrgUrl(bustedCustomCover)) {
      const customUrl = bustedCustomCover.trim();
      
      // For custom covers, set directly without cache or fallback
      if (lastIdentityRef.current !== identity) {
        lastIdentityRef.current = identity;
        resolvedSrcRef.current = null;
      }
      
      // Set the custom cover URL directly
      resolvedSrcRef.current = customUrl;
      setImgSrc(customUrl);
      return;
    }

    // Si identity n'a pas changé et qu'on a déjà une image résolue, ne rien faire
    if (lastIdentityRef.current === identity && resolvedSrcRef.current) {
      setImgSrc(resolvedSrcRef.current);
      return;
    }

    // Si identity a changé, reset le cache local
    if (lastIdentityRef.current !== identity) {
      lastIdentityRef.current = identity;
      resolvedSrcRef.current = null;
    }

    let cancelled = false;

    const safeSetResolved = (url: string) => {
      if (cancelled) return;
      if (reqId !== reqIdRef.current) return; // ignore anciennes requêtes
      resolvedSrcRef.current = url;
      setImgSrc(url);
    };

    const safeFallback = () => {
      // IMPORTANT: ne fallback QUE si on n'a jamais eu de resolvedSrc
      if (cancelled) return;
      if (reqId !== reqIdRef.current) return;
      if (resolvedSrcRef.current) return; // <- clé anti-despawn
      setImgSrc('/placeholder-cover.svg');
    };

    // Annuler timeout précédent
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    
    // Si on a déjà une image résolue, l'utiliser immédiatement
    if (resolvedSrcRef.current) {
      setImgSrc(resolvedSrcRef.current);
      return;
    }
    
    // Essayer de charger les sources
    (async () => {
      const sources = buildSources();
      let sourceIndex = 0;

      const tryNextSource = async (): Promise<void> => {
        if (cancelled || reqId !== reqIdRef.current) return;

        if (sourceIndex >= sources.length) {
          safeFallback();
          return;
    }
    
        const source = sources[sourceIndex];
        
        if (source.type === 'placeholder') {
          safeFallback();
          return;
        }

        log(`[BookCover] ${title}: Trying source ${source.type} - ${source.url}`);

        // Créer une image pour tester le chargement
        const img = new Image();
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let resolved = false;

        const cleanup = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          img.onload = null;
          img.onerror = null;
        };

        const onSuccess = () => {
          if (resolved || cancelled || reqId !== reqIdRef.current) return;
          resolved = true;
          cleanup();

          const finalUrl = img.src;
          if (isArchiveOrgUrl(finalUrl)) {
            log(`[BookCover] ${title}: Archive.org detected, trying next source`);
            sourceIndex++;
            tryNextSource();
      return;
    }
    
          // Marquer comme valide dans le cache
          coverCache.set(source.url, { ok: true, ts: Date.now() });
          safeSetResolved(finalUrl);

          if (onCoverLoaded && source.type !== 'initial') {
            onCoverLoaded(finalUrl, source.type);
          }

          log(`[BookCover] ${title}: ✓ Loaded ${source.type}`);
        };

        const onError = () => {
          if (resolved || cancelled || reqId !== reqIdRef.current) return;
          resolved = true;
          cleanup();

          // Marquer comme invalide seulement si erreur réelle (pas timeout)
          coverCache.set(source.url, { ok: false, ts: Date.now() });

          sourceIndex++;
          tryNextSource();
        };

        img.onload = onSuccess;
        img.onerror = onError;

        // Timeout pour passer à la source suivante
        timeoutId = setTimeout(() => {
          if (resolved) return;
          log(`[BookCover] ${title}: Timeout on ${source.type}, trying next`);
          sourceIndex++;
          tryNextSource();
    }, COVER_TIMEOUT_MS);

        img.src = source.url;
      };

      await tryNextSource();
    })();

    return () => {
      cancelled = true;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [identity, bustedCustomCover]); // <- dépendance MINIMALE

  const isPlaceholder = imgSrc === '/placeholder-cover.svg' && !resolvedSrcRef.current;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!isPlaceholder ? (
        <img
          src={imgSrc}
          alt={`${title}${author ? ` - ${author}` : ""}`}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="w-full h-full bg-neutral-200 flex items-center justify-center relative">
          <span className="text-xs text-black/50 px-2 text-center line-clamp-3">
            {title}
          </span>
        </div>
      )}

      {/* Add Cover Button (shown when placeholder and button enabled) */}
      {isPlaceholder && showAddCoverButton && onAddCover && bookId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onAddCover();
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
          aria-label="Ajouter une couverture"
        >
          <div className="bg-black/60 backdrop-blur-sm rounded-full p-2.5 group-hover:bg-black/70 transition-colors">
            <Camera className="w-5 h-5 text-white" />
          </div>
        </button>
      )}

      {/* Quick Actions (Like/Comment buttons) */}
      {showQuickActions && book && (
        <BookQuickActions
          book={book}
          likesCount={likes}
          commentsCount={comments}
          initiallyLiked={isLiked}
          onCountsChange={onCountsChange}
          onOpenComments={onOpenComments}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}

