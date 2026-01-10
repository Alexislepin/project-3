import { useState, useEffect, useRef, useMemo } from "react";
import { Camera } from "lucide-react";
import { BookQuickActions } from "./BookQuickActions";
import { supabase } from "../lib/supabase";
import { addCacheBuster } from "../lib/resolveImageUrl";
import { Capacitor } from "@capacitor/core";
import { resolveBookCover } from "../lib/bookCover";

/**
 * Échappe les caractères XML pour éviter les injections
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Encode une string UTF-8 en base64 (gère les accents et caractères spéciaux)
 */
function toBase64Utf8(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

/**
 * Génère une cover SVG avec gradient et texte (titre/auteur)
 */
function generateCoverSVG(title: string, author: string): string {
  // Couleurs de gradient (variations de bleu/violet)
  const colors = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
  ];
  
  // Sélectionner une couleur basée sur le hash du titre
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const [color1, color2] = colors[hash % colors.length];
  
  // Tronquer le titre si trop long
  const displayTitle = title.length > 30 ? title.substring(0, 27) + '...' : title;
  const displayAuthor = author.length > 25 ? author.substring(0, 22) + '...' : author;
  
  // Échapper le XML pour éviter les injections
  const safeTitle = escapeXml(displayTitle);
  const safeAuthor = escapeXml(displayAuthor);
  
  const svg = `
    <svg width="200" height="300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="300" fill="url(#grad)"/>
      <text x="100" y="120" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">
        ${safeTitle.split(' ').slice(0, 3).join(' ')}
      </text>
      ${safeTitle.split(' ').length > 3 ? `
      <text x="100" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">
        ${safeTitle.split(' ').slice(3).join(' ')}
      </text>
      ` : ''}
      <text x="100" y="200" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="middle">
        ${safeAuthor}
      </text>
    </svg>
  `.trim();
  
  return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
}


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
   * Forces https on iOS (http is blocked)
   */
  const resolveStorageUrl = (input: string | null): string | null => {
    if (!input) return null;
    
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
  
  // Resolve custom cover (path -> URL if needed)
  const resolvedCustomCover = resolveStorageUrl(customCover);
  const resolvedCoverUrl = resolveStorageUrl(coverUrl);
  
  // Try to resolve cover with fallbacks (OpenLibrary, Google Books, etc.)
  const resolvedCover = useMemo(() => {
    // Priority 1: Custom cover (user-specific)
    if (resolvedCustomCover) {
      return resolvedCustomCover;
    }
    
    // Priority 2: cover_url from database
    if (resolvedCoverUrl) {
      return resolvedCoverUrl;
    }
    
    // Priority 3: OpenLibrary cover_i (most reliable)
    const olCoverId = openlibrary_cover_id ?? cover_i;
    if (olCoverId && typeof olCoverId === 'number' && olCoverId > 0) {
      return `https://covers.openlibrary.org/b/id/${olCoverId}-L.jpg?default=false`;
    }
    
    // Priority 4: Google Books cover URL
    if (googleCoverUrl) {
      return googleCoverUrl;
    }
    
    // Priority 5: OpenLibrary via ISBN (ISBN13 preferred, then ISBN10)
    const cleanIsbn = isbn13 || isbn10 || isbn;
    if (cleanIsbn) {
      const cleaned = cleanIsbn.replace(/[-\s]/g, '');
      if (cleaned.length >= 10) {
        return `https://covers.openlibrary.org/b/isbn/${cleaned}-L.jpg?default=false`;
      }
    }
    
    // Fallback: placeholder
    return '/covers/placeholder-book.png';
  }, [resolvedCustomCover, resolvedCoverUrl, openlibrary_cover_id, cover_i, googleCoverUrl, isbn13, isbn10, isbn]);
  
  // Add cache-buster ONLY when cacheKey is provided (and stable)
  const finalCoverUrl = useMemo(() => {
    if (!resolvedCover) return undefined;
    if (!cacheKey) return resolvedCover; // ✅ no buster => stable
    return addCacheBuster(resolvedCover, cacheKey);
  }, [resolvedCover, cacheKey]);

  // ✅ Always validate src
  const safeCoverUrl = useMemo(() => {
    if (!finalCoverUrl) return undefined;

    if (
      finalCoverUrl.startsWith("http://") ||
      finalCoverUrl.startsWith("https://") ||
      finalCoverUrl.startsWith("data:") ||
      finalCoverUrl.startsWith("/")
    ) {
      return finalCoverUrl;
    }

    console.warn("[BookCover] Rejected invalid cover URL:", finalCoverUrl);
    return undefined;
  }, [finalCoverUrl]);

  // Real displayed src (can fallback to placeholder on error)
  const [imgSrc, setImgSrc] = useState<string | undefined>(safeCoverUrl);
  const imgErrorRef = useRef(false);

  useEffect(() => {
    // ✅ avoid useless setState if same
    setImgSrc((prev) => (prev === safeCoverUrl ? prev : safeCoverUrl));
    imgErrorRef.current = false;
  }, [safeCoverUrl]);

  const PLACEHOLDER = "/covers/placeholder-book.png";

  const handleImageError = () => {
    if (imgErrorRef.current) return;
    imgErrorRef.current = true;
    setImgSrc(PLACEHOLDER);
  };

  const isPlaceholder = !imgSrc || imgSrc === PLACEHOLDER;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {imgSrc && imgSrc !== PLACEHOLDER ? (
        <img
          src={imgSrc}
          alt={`${title}${author ? ` - ${author}` : ""}`}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={handleImageError}
        />
      ) : (
        // Neutral placeholder with title text (never render broken <img>)
        <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center p-4">
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-600 line-clamp-3 mb-1">
              {title || 'Sans titre'}
            </p>
            {author && (
              <p className="text-xs text-gray-500 line-clamp-1">
                {author}
              </p>
            )}
          </div>
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

