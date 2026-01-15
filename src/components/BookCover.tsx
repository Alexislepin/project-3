import { useState, useEffect, useRef, useMemo } from "react";
import { Camera } from "lucide-react";
import { BookQuickActions } from "./BookQuickActions";
import { supabase } from "../lib/supabase";
import { Capacitor } from "@capacitor/core";
import { getPooledCoverUrl } from "../lib/pooledCovers";
import { canonicalBookKey } from "../lib/bookSocial";

/**
 * Helper: clean ISBN by removing non-digit characters
 */
const cleanIsbn = (v?: string | null): string | null => {
  if (!v) return null;
  const cleaned = v.replace(/[-\s]/g, '');
  return cleaned.length >= 10 ? cleaned : null;
};

/**
 * Helper: check if URL is empty or placeholder
 */
const isEmptyOrPlaceholder = (url?: string | null): boolean => {
  if (!url) return true;
  const u = url.toLowerCase();
  if (u.includes('placeholder')) return true;
  if (u.includes('image_not_available')) return true;
  if (u.includes('/covers/placeholder-book')) return true;
  return false;
};

/**
 * Helper: check if URL is trusted (our storage, Google, OpenLibrary ID-based)
 */
const isTrustedCoverUrl = (url?: string | null): boolean => {
  if (!url) return false;

  // Our pooled storage (Supabase storage bucket "book-covers")
  if (url.includes('/storage/v1/object/public/book-covers/')) return true;
  if (url.includes('supabase.co/storage/v1/object/public/book-covers/')) return true;

  // Google thumbnails
  if (url.includes('books.google.com') || url.includes('googleusercontent.com')) return true;

  // OpenLibrary ID-based is generally ok (better than /b/isbn)
  if (url.includes('covers.openlibrary.org/b/id/')) return true;

  return false;
};

/**
 * Helper: resolve storage path to public URL
 * Rejects local URIs and forces https on iOS
 */
const resolveStorageUrl = (input: string | null | undefined): string | null => {
  if (!input || isEmptyOrPlaceholder(input)) return null;
  
  // Reject local URIs - these should never be stored in DB
  if (input.startsWith('file://') || input.startsWith('capacitor://')) {
    console.warn('[BookCover] Rejected local URI:', input);
    return null;
  }
  
  // If it's already an HTTP(S) URL, use it directly
  if (input.startsWith('http://') || input.startsWith('https://')) {
    // ⚠️ iOS: force https (http is blocked by App Transport Security)
    if (Capacitor.getPlatform() === 'ios' && input.startsWith('http://')) {
      return input.replace('http://', 'https://');
    }
    return input;
  }
  
  // Otherwise, treat it as a storage path and resolve to public URL
  const { data } = supabase.storage.from('book-covers').getPublicUrl(input);
  return data?.publicUrl || null;
};

/**
 * Helper: hash string to a hue value (0-360) for deterministic color generation
 */
function hashStringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

/**
 * Helper: escape XML/HTML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Helper: extract initials from title (e.g., "Harry Potter" -> "HP")
 */
function getInitialsFromTitle(title: string): string {
  if (!title) return '?';
  const words = title.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/**
 * Generate a fallback cover as SVG data-uri
 * Always returns a valid data-uri that will never fail to load
 */
function generateFallbackCoverDataUri(title: string, author?: string): string {
  const safeTitle = title || 'Sans titre';
  const safeAuthor = author || '';
  const initials = getInitialsFromTitle(safeTitle);
  
  // Generate deterministic colors from title hash
  const hue = hashStringToHue(safeTitle);
  const primaryHue = hue;
  const secondaryHue = (hue + 60) % 360; // Complementary color
  
  // Convert HSL to RGB for gradient stops
  const hslToRgb = (h: number, s: number, l: number): string => {
    h = h / 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (h < 1/6) { r = c; g = x; }
    else if (h < 2/6) { r = x; g = c; }
    else if (h < 3/6) { g = c; b = x; }
    else if (h < 4/6) { g = x; b = c; }
    else if (h < 5/6) { r = x; b = c; }
    else { r = c; b = x; }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    return `rgb(${r},${g},${b})`;
  };
  
  const color1 = hslToRgb(primaryHue, 0.6, 0.5);
  const color2 = hslToRgb(secondaryHue, 0.5, 0.6);
  const color3 = hslToRgb((primaryHue + 120) % 360, 0.4, 0.55);
  
  // Truncate title to fit (max 3 lines, ~40 chars per line)
  const maxTitleLength = 120;
  const displayTitle = safeTitle.length > maxTitleLength 
    ? safeTitle.substring(0, maxTitleLength) + '...'
    : safeTitle;
  
  // Split title into lines (roughly 40 chars per line)
  const words = displayTitle.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).length > 40 && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  const titleLines = lines.slice(0, 3); // Max 3 lines
  
  const svg = `
<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${color2};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color3};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect width="400" height="600" fill="url(#bg)"/>
  <g transform="translate(200, 200)">
    <circle cx="0" cy="0" r="50" fill="rgba(255,255,255,0.15)" filter="url(#shadow)"/>
    <text x="0" y="10" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="bold" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle">${escapeXml(initials)}</text>
  </g>
  <g transform="translate(200, 450)">
    ${titleLines.map((line, idx) => `
    <text x="0" y="${idx * 28}" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="600" fill="rgba(255,255,255,0.95)" text-anchor="middle" dominant-baseline="middle">${escapeXml(line)}</text>
    `).join('')}
    ${safeAuthor ? `
    <text x="0" y="${titleLines.length * 28 + 8}" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="400" fill="rgba(255,255,255,0.75)" text-anchor="middle" dominant-baseline="middle">${escapeXml(safeAuthor)}</text>
    ` : ''}
  </g>
</svg>`.trim();
  
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type BookCoverProps = {
  title: string;
  author?: string;
  coverUrl?: string | null; // Initial cover URL (can be from any source)
  custom_cover_url?: string | null; // User-specific custom cover (highest priority)
  customCoverUrl?: string | null; // Alias for custom_cover_url (for compatibility)
  cacheKey?: string; // Cache-busting key (e.g., updated_at timestamp) - when this changes, reset state
  isbn?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  cover_i?: number | null; // OpenLibrary cover ID (most reliable)
  openlibrary_cover_id?: number | null; // Alias for cover_i
  googleCoverUrl?: string | null; // Google Books thumbnail/smallThumbnail
  bookKey?: string | null; // Explicit book_key (e.g., 'isbn:9781234567890' or 'uuid:...')
  book?: any; // Full book object for quick actions (used to derive book_key if not provided)
  className?: string;
  likes?: number;
  comments?: number;
  isLiked?: boolean; // Whether current user has liked this book
  onCountsChange?: (nextLikes: number, nextComments: number, nextLiked: boolean) => void;
  onOpenComments?: () => void;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  showQuickActions?: boolean; // Whether to show quick actions buttons
  onCoverLoaded?: (url: string, source: string) => void; // Callback when a valid cover is loaded (DEPRECATED: no DB writeback)
  onAddCover?: () => void; // Callback when user wants to add a custom cover
  bookId?: string; // Book ID for custom cover upload
  showAddCoverButton?: boolean; // Whether to show "Add cover" button when placeholder
};

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
  bookKey: explicitBookKey,
  onCoverLoaded,
  onAddCover,
  bookId,
  showAddCoverButton = false,
}: BookCoverProps) {
  // Get custom cover URL (support both prop names AND book.custom_cover_url)
  const customCoverProp = custom_cover_url ?? customCoverUrl ?? null;
  const customCoverFromBook = book?.custom_cover_url ?? null;

  // Derive book_key for OpenLibrary ISBN fallback
  const derivedBookKey = useMemo(() => {
    if (explicitBookKey && explicitBookKey.trim() && explicitBookKey !== 'unknown') {
      return explicitBookKey.trim();
    }
    if (book) {
      const key = canonicalBookKey(book);
      if (key && key !== 'unknown') {
        return key;
      }
    }
    const isbnValue = cleanIsbn(isbn13) || cleanIsbn(isbn10) || cleanIsbn(isbn);
    if (isbnValue) {
      return `isbn:${isbnValue}`;
    }
    if (book?.id && typeof book.id === 'string' && book.id.length > 10) {
      return `uuid:${book.id}`;
    }
    return null;
  }, [explicitBookKey, book, isbn13, isbn10, isbn]);

  // Build ordered candidate list (EXACT priority as specified)
  // PRIORITY:
  // 1. custom_cover_url (if present)
  // 2. OpenLibrary cover via openlibrary_cover_id (highest priority)
  // 3. If bookKey is isbn:XXXXXXXXX, fallback OpenLibrary ISBN cover
  // 4. coverUrl (explicit prop, e.g. books.cover_url from Supabase)
  // 5. googleCoverUrl (ONLY if coverUrl is null/empty/placeholder AND no openlibrary_cover_id)
  // 6. Placeholder
  const candidates = useMemo(() => {
    const list: string[] = [];

    // 1) custom_cover_url (prop explicite ou from book)
    const customCover = customCoverProp ?? customCoverFromBook ?? null;
    if (customCover && !isEmptyOrPlaceholder(customCover)) {
      const resolved = resolveStorageUrl(customCover);
      if (resolved) list.push(resolved);
    }

    // 2) OpenLibrary cover via openlibrary_cover_id (highest priority after custom)
    const olCoverId = openlibrary_cover_id ?? cover_i;
    if (olCoverId && typeof olCoverId === 'number' && olCoverId > 0) {
      const olIdUrl = `https://covers.openlibrary.org/b/id/${olCoverId}-L.jpg?default=false`;
      list.push(olIdUrl);
    }

    // 3) If bookKey is isbn:XXXXXXXXX, fallback OpenLibrary ISBN cover
    if (derivedBookKey && derivedBookKey.startsWith('isbn:')) {
      const isbnFromKey = derivedBookKey.replace('isbn:', '');
      const olIsbnUrl = `https://covers.openlibrary.org/b/isbn/${isbnFromKey}-L.jpg?default=false`;
      if (!list.includes(olIsbnUrl)) {
        list.push(olIsbnUrl);
      }
    } else {
      // Fallback: try to build from ISBN props if bookKey is not isbn:
      const isbnValue = cleanIsbn(isbn13) || cleanIsbn(isbn10) || cleanIsbn(isbn);
      if (isbnValue) {
        const olIsbnUrl = `https://covers.openlibrary.org/b/isbn/${isbnValue}-L.jpg?default=false`;
        if (!list.includes(olIsbnUrl)) {
          list.push(olIsbnUrl);
        }
      }
    }

    // 4) coverUrl (explicit prop, e.g. books.cover_url from Supabase)
    // Check if coverUrl is already an OpenLibrary cover or valid image
    const hasValidCoverUrl = coverUrl && !isEmptyOrPlaceholder(coverUrl);
    const isCoverUrlOpenLibrary = hasValidCoverUrl && (
      coverUrl.includes('covers.openlibrary.org') || 
      isTrustedCoverUrl(coverUrl)
    );
    
    if (hasValidCoverUrl && !isCoverUrlOpenLibrary) {
      // Only add if it's not already an OpenLibrary cover (to avoid duplicates)
      const resolved = resolveStorageUrl(coverUrl);
      if (resolved && !list.includes(resolved)) {
        list.push(resolved);
      }
    } else if (isCoverUrlOpenLibrary) {
      // coverUrl is already OpenLibrary or trusted - use it (may already be in list from step 2)
      const resolved = resolveStorageUrl(coverUrl);
      if (resolved && !list.includes(resolved)) {
        list.push(resolved);
      }
    }

    // 5) googleCoverUrl (ONLY if coverUrl is null/empty/placeholder AND no openlibrary_cover_id)
    // ⚠️ Important: if coverUrl is already an OpenLibrary cover OR valid image (non-placeholder),
    // then googleCoverUrl must never "take over"
    if (!hasValidCoverUrl && !olCoverId && googleCoverUrl && !isEmptyOrPlaceholder(googleCoverUrl)) {
      if (!list.includes(googleCoverUrl)) {
        list.push(googleCoverUrl);
      }
    }

    // 6) Fallback SVG data-uri (always last, never fails)
    const fallbackDataUri = generateFallbackCoverDataUri(title, author);
    list.push(fallbackDataUri);

    // De-duplicate while preserving order
    return Array.from(new Set(list));
  }, [customCoverProp, customCoverFromBook, openlibrary_cover_id, cover_i, derivedBookKey, isbn13, isbn10, isbn, coverUrl, googleCoverUrl, title, author]);

  // Track current candidate index and failed URLs for this instance
  const [currentIdx, setCurrentIdx] = useState(0);
  const failedUrlsRef = useRef<Set<string>>(new Set());

  // Compute a stable "identity key" that changes when props that should trigger a reset change
  const identityKey = useMemo(() => {
    return [
      bookId || '',
      cacheKey || '',
      customCoverProp || '',
      customCoverFromBook || '',
      coverUrl || '',
      googleCoverUrl || '',
      openlibrary_cover_id?.toString() || cover_i?.toString() || '',
      isbn13 || isbn10 || isbn || '',
    ].join('|');
  }, [bookId, cacheKey, customCoverProp, customCoverFromBook, coverUrl, googleCoverUrl, openlibrary_cover_id, cover_i, isbn13, isbn10, isbn]);

  // Reset state when identity key changes (new book, cover changed, etc.)
  const prevIdentityKeyRef = useRef<string>('');
  useEffect(() => {
    if (prevIdentityKeyRef.current !== identityKey) {
      const previousKey = prevIdentityKeyRef.current;
      // Reset to first candidate
      setCurrentIdx(0);
      // Clear failed URLs cache (new identity = fresh start)
      failedUrlsRef.current = new Set();
      prevIdentityKeyRef.current = identityKey;
      
      if (import.meta.env.DEV) {
        console.debug('[BookCover] Reset state due to identity change', {
          title,
          previousKey,
          newKey: identityKey,
          candidatesCount: candidates.length,
          candidates: candidates.slice(0, -1), // Exclude placeholder
        });
      }
    }
  }, [identityKey, title, candidates.length]);

  // Find first valid candidate (skip failed URLs)
  const effectiveIdx = useMemo(() => {
    // Find first candidate that hasn't failed, starting from currentIdx
    for (let i = currentIdx; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (!failedUrlsRef.current.has(candidate)) {
        return i;
      }
    }
    // All candidates failed, return last index (placeholder)
    return candidates.length - 1;
  }, [candidates, currentIdx]);

  // Sync currentIdx with effectiveIdx if they differ (skip failed URLs automatically)
  useEffect(() => {
    if (effectiveIdx !== currentIdx && effectiveIdx < candidates.length) {
      setCurrentIdx(effectiveIdx);
    }
  }, [effectiveIdx, currentIdx, candidates.length]);

  // Current src to display (always valid - last candidate is SVG data-uri)
  const currentSrc = candidates[effectiveIdx] || candidates[candidates.length - 1] || generateFallbackCoverDataUri(title, author);

  // Track pooled cover URL (async, for future use - not in priority list yet)
  const [pooledUrl, setPooledUrl] = useState<string | null>(null);
  const lastPooledKeyRef = useRef<string | null>(null);
  const hasCustom = !!customCoverProp || !!customCoverFromBook;

  // Load pooled cover (for future use - not in priority list per requirements)
  useEffect(() => {
    let cancelled = false;
    if (!derivedBookKey || hasCustom) {
      setPooledUrl(null);
      lastPooledKeyRef.current = null;
      return;
    }
    if (lastPooledKeyRef.current === derivedBookKey && pooledUrl !== undefined) {
      return;
    }
    lastPooledKeyRef.current = derivedBookKey;
    (async () => {
      const url = await getPooledCoverUrl(derivedBookKey);
      if (cancelled) return;
      setPooledUrl(url || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [derivedBookKey, hasCustom]);

  // DEV-only debug log (once per render when src changes)
  const prevSrcRef = useRef<string>('');
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (prevSrcRef.current !== currentSrc) {
      console.debug('[BookCover] Cover resolved', {
        title,
        bookId,
        identityKey,
        candidatesCount: candidates.length,
        candidates: candidates.slice(0, -1), // Exclude placeholder
        currentIdx,
        failedUrls: Array.from(failedUrlsRef.current),
        finalSrc: currentSrc,
        source: candidates.indexOf(currentSrc) >= 0 ? `candidate[${candidates.indexOf(currentSrc)}]` : 'placeholder',
      });
      prevSrcRef.current = currentSrc;
    }
  }, [title, bookId, identityKey, candidates.length, currentIdx, currentSrc]);

  // Handle image error: mark URL as failed and advance to next candidate
  // Note: SVG data-uri (last candidate) should never fail, but we handle it gracefully
  const handleImageError = () => {
    const failedUrl = currentSrc;
    const isFallbackSvg = failedUrl && failedUrl.startsWith('data:image/svg+xml');
    
    // Don't mark SVG data-uri as failed (it should always load)
    if (failedUrl && !isFallbackSvg) {
      failedUrlsRef.current.add(failedUrl);
      
      if (import.meta.env.DEV) {
        console.debug('[BookCover] Image failed, advancing to next candidate', {
          title,
          failedUrl,
          currentIdx,
          nextIdx: currentIdx + 1,
          remainingCandidates: candidates.length - currentIdx - 1,
        });
      }

      // Advance to next candidate (SVG data-uri is last, so this will eventually reach it)
      if (currentIdx < candidates.length - 1) {
        setCurrentIdx((prev) => prev + 1);
      }
    } else if (isFallbackSvg && import.meta.env.DEV) {
      console.warn('[BookCover] SVG fallback failed (unexpected)', { title, failedUrl });
    }
  };

  // Check if current src is the fallback SVG
  const isFallback = currentSrc && currentSrc.startsWith('data:image/svg+xml');

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Always render <img> - even for fallback SVG (guarantees an image is always displayed) */}
      <img
        key={`${identityKey}-${currentIdx}`} // Force re-mount on identity/idx change to clear browser cache
        src={currentSrc}
        alt={`${title}${author ? ` - ${author}` : ""}`}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        onError={handleImageError}
        onLoad={() => {
          // Optional: notify parent that a cover loaded (for analytics, but NO DB writeback)
          // Don't notify for fallback SVG (it's not a "real" cover)
          if (onCoverLoaded && !isFallback) {
            onCoverLoaded(currentSrc, 'resolved');
          }
        }}
      />

      {/* Add Cover Button (shown when fallback SVG and button enabled) */}
      {isFallback && showAddCoverButton && onAddCover && bookId && (
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