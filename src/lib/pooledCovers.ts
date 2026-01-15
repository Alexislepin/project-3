import { supabase } from './supabase';

/**
 * In-memory cache for pooled cover URLs to avoid repeated queries during scrolling.
 * Keyed by book_key (normalized).
 * 
 * Cache structure:
 * - Key: book_key (string, normalized)
 * - Value: { url: string | null, timestamp: number }
 */
const pooledCoverCache = new Map<string, { url: string | null; timestamp: number }>();

/**
 * Cache TTL: 1 hour (3600000 ms)
 * This ensures cache stays fresh for a reasonable time while allowing updates
 */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Clear stale cache entries (older than TTL)
 * This is called periodically to prevent memory leaks
 */
function cleanCache(): void {
  const now = Date.now();
  for (const [key, value] of pooledCoverCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      pooledCoverCache.delete(key);
    }
  }
}

/**
 * Normalize book_key for caching (trim and lowercase)
 */
function normalizeCacheKey(bookKey: string): string {
  return bookKey.trim().toLowerCase();
}

/**
 * Fetch a pooled cover URL from the public.book_covers table by book_key.
 * 
 * This function queries the centralized pool of book covers uploaded by users.
 * The pool allows deterministic fallback to covers already uploaded by any user
 * for the same book_key (e.g., 'isbn:9781234567890' or 'uuid:...').
 * 
 * RLS Policy: Public read access is enabled, so this is safe to call from the client.
 * 
 * Caching: Results are cached in-memory to avoid repeated queries during scrolling.
 * Cache is keyed by book_key (normalized) and has a 1-hour TTL.
 * 
 * @param bookKey - Book identifier (e.g., 'isbn:9781234567890' or 'uuid:abc123...')
 * @returns Public URL to the cover image in Supabase Storage, or null if not found
 * 
 * @example
 * ```ts
 * // Fetch cover for a book by ISBN
 * const coverUrl = await getPooledCoverUrl('isbn:9781234567890');
 * if (coverUrl) {
 *   console.log('Found pooled cover:', coverUrl);
 *   // Use coverUrl in <img src={coverUrl} />
 * } else {
 *   console.log('No pooled cover found, use fallback');
 * }
 * 
 * // Fetch cover for a book by UUID
 * const uuidCoverUrl = await getPooledCoverUrl('uuid:123e4567-e89b-12d3-a456-426614174000');
 * 
 * // Integration in cover resolver priority chain:
 * // 1. Custom cover (user-specific)
 * // 2. Pooled cover (this function) ← NEW!
 * // 3. OpenLibrary cover
 * // 4. Google Books cover
 * // 5. Placeholder
 * const pooledUrl = await getPooledCoverUrl(bookKey);
 * if (pooledUrl) return pooledUrl;
 * // ... continue with other fallbacks
 * ```
 */
export async function getPooledCoverUrl(bookKey: string): Promise<string | null> {
  if (!bookKey || bookKey.trim().length === 0) {
    return null;
  }

  const normalizedKey = normalizeCacheKey(bookKey);

  // Check cache first
  const cached = pooledCoverCache.get(normalizedKey);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL_MS) {
      // Cache hit: return cached value
      return cached.url;
    }
    // Cache expired: remove and continue to fetch
    pooledCoverCache.delete(normalizedKey);
  }

  // Clean stale cache entries periodically (every 10th call)
  if (pooledCoverCache.size > 0 && Math.random() < 0.1) {
    cleanCache();
  }

  try {
    // Query public.book_covers table for the given book_key
    // RLS policy allows public read access, so this is safe from client
    const { data, error } = await supabase
      .from('book_covers')
      .select('storage_path')
      .eq('book_key', bookKey.trim())
      .maybeSingle();

    if (error) {
      console.error('[getPooledCoverUrl] Query error:', {
        bookKey,
        error: error.message,
        code: error.code,
      });
      // Cache null result to avoid repeated failed queries
      pooledCoverCache.set(normalizedKey, { url: null, timestamp: Date.now() });
      return null;
    }

    // If no row found, cache null and return null
    if (!data || !data.storage_path) {
      pooledCoverCache.set(normalizedKey, { url: null, timestamp: Date.now() });
      return null;
    }

    // Build public URL using Supabase Storage client
    // Bucket 'book-covers' is public, so getPublicUrl works for any authenticated or anonymous user
    const { data: urlData } = supabase.storage
      .from('book-covers')
      .getPublicUrl(data.storage_path);

    const publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      console.warn('[getPooledCoverUrl] Failed to generate public URL:', {
        bookKey,
        storage_path: data.storage_path,
      });
      // Cache null result
      pooledCoverCache.set(normalizedKey, { url: null, timestamp: Date.now() });
      return null;
    }

    // Cache successful result
    pooledCoverCache.set(normalizedKey, { url: publicUrl, timestamp: Date.now() });

    return publicUrl;
  } catch (error: any) {
    console.error('[getPooledCoverUrl] Unexpected error:', {
      bookKey,
      error: error?.message || String(error),
    });
    // Cache null result to avoid repeated failed queries
    pooledCoverCache.set(normalizedKey, { url: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Clear the pooled cover cache (useful for testing or forced refresh)
 */
export function clearPooledCoverCache(): void {
  pooledCoverCache.clear();
}

/**
 * Upsert a cover into the public.book_covers pool after successful upload.
 * This allows other users to reuse the cover for the same book_key.
 * 
 * RLS Policy: Requires created_by = auth.uid() for INSERT/UPDATE.
 * 
 * @param params - Upsert parameters
 * @param params.bookKey - Book identifier (e.g., 'isbn:9781234567890' or 'uuid:...')
 * @param params.storagePath - Path in Storage bucket "book-covers" (e.g., 'user_covers/abc123/def456/cover_123456.jpg')
 * @param params.width - Optional image width in pixels
 * @param params.height - Optional image height in pixels
 * @param params.createdBy - User ID who uploaded the cover (must match auth.uid() for RLS)
 * @returns Success status and error if any
 * 
 * @example
 * ```ts
 * // After successful upload to storage
 * const { path, publicUrl } = await uploadImageToSupabase(...);
 * 
 * // Get book_key from book object
 * const bookKey = canonicalBookKey(book);
 * 
 * // Upsert into pool (non-blocking)
 * const { success, error } = await upsertPooledCover({
 *   bookKey,
 *   storagePath: path,
 *   width: image.width,
 *   height: image.height,
 *   createdBy: user.id,
 * });
 * 
 * if (!success && error) {
 *   console.error('Failed to add cover to pool:', error);
 *   // Show toast to user (non-critical failure)
 * }
 * ```
 */
export async function upsertPooledCover(params: {
  bookKey: string;
  storagePath: string;
  width?: number | null;
  height?: number | null;
  createdBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const { bookKey, storagePath, width, height, createdBy } = params;

  // Validate inputs
  if (!bookKey || bookKey.trim().length === 0 || bookKey === 'unknown') {
    return { success: false, error: 'Invalid book_key' };
  }

  if (!storagePath || storagePath.trim().length === 0) {
    return { success: false, error: 'Invalid storage_path' };
  }

  if (!createdBy || createdBy.trim().length === 0) {
    return { success: false, error: 'Invalid created_by (user ID required)' };
  }

  try {
    // First, check if a cover already exists for this book_key
    const { data: existingCover, error: selectError } = await supabase
      .from('book_covers')
      .select('id, created_by')
      .eq('book_key', bookKey.trim())
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      console.error('[upsertPooledCover] Select error:', {
        bookKey,
        error: selectError.message,
        code: selectError.code,
      });
    }

    // Prepare the data for upsert
    const coverData = {
      book_key: bookKey.trim(),
      storage_path: storagePath.trim(),
      source: 'user' as const,
      width: width && width > 0 ? width : null,
      height: height && height > 0 ? height : null,
      created_by: createdBy,
    };

    let upsertError: any = null;

    if (existingCover) {
      // Cover exists: try UPDATE (only if created_by matches auth.uid() per RLS)
      // If created_by doesn't match, UPDATE will fail due to RLS, which is acceptable
      // The cover remains with the original creator (first upload wins)
      const { error: updateError } = await supabase
        .from('book_covers')
        .update({
          storage_path: storagePath.trim(),
          width: width && width > 0 ? width : null,
          height: height && height > 0 ? height : null,
          updated_at: new Date().toISOString(),
        })
        .eq('book_key', bookKey.trim())
        .eq('created_by', createdBy); // Only update if user is the creator (RLS check)

      if (updateError) {
        upsertError = updateError;
        // If UPDATE failed due to RLS (user is not creator), this is acceptable
        // The original cover stays in the pool (first upload wins)
        if (updateError.code === '42501' || updateError.message.includes('row-level security') || updateError.message.includes('RLS')) {
          console.debug('[upsertPooledCover] UPDATE failed: user is not creator (first upload wins)', {
            bookKey,
            existingCreator: existingCover.created_by,
            currentUser: createdBy,
          });
          // This is acceptable - first upload wins
          return { success: true }; // Success (cover already exists from first upload)
        }
      } else {
        // UPDATE succeeded
        console.debug('[upsertPooledCover] Successfully updated pooled cover:', bookKey);
      }
    } else {
      // Cover doesn't exist: try INSERT
      const { error: insertError } = await supabase
        .from('book_covers')
        .insert(coverData);

      if (insertError) {
        upsertError = insertError;
        // If INSERT failed due to unique constraint violation (race condition),
        // another user just inserted it, which is fine
        if (insertError.code === '23505') {
          console.debug('[upsertPooledCover] INSERT failed: race condition (another user inserted first)', {
            bookKey,
          });
          // This is acceptable - another user won the race
          return { success: true }; // Success (cover now exists from other user)
        }
      } else {
        // INSERT succeeded
        console.debug('[upsertPooledCover] Successfully inserted pooled cover:', bookKey);
      }
    }

    // If we have an error that wasn't handled above, log it
    if (upsertError) {
      console.error('[upsertPooledCover] Upsert error:', {
        bookKey,
        storagePath,
        createdBy,
        existingCover: existingCover ? 'yes' : 'no',
        error: upsertError.message,
        code: upsertError.code,
        details: (upsertError as any).details,
        hint: (upsertError as any).hint,
      });

      // Check if error is due to RLS policy violation
      if (upsertError.code === '42501' || upsertError.message.includes('row-level security') || upsertError.message.includes('RLS')) {
        return {
          success: false,
          error: `RLS policy violation: ${upsertError.message}. Ensure created_by matches auth.uid() for UPDATE.`,
        };
      }

      return {
        success: false,
        error: upsertError.message || 'Failed to upsert pooled cover',
      };
    }

    // Clear cache for this book_key so next fetch gets fresh data
    const normalizedKey = normalizeCacheKey(bookKey);
    pooledCoverCache.delete(normalizedKey);

    return { success: true };
  } catch (error: any) {
    console.error('[upsertPooledCover] Unexpected error:', {
      bookKey,
      storagePath,
      createdBy,
      error: error?.message || String(error),
      stack: error?.stack,
    });

    return {
      success: false,
      error: error?.message || 'Unexpected error upserting pooled cover',
    };
  }
}

