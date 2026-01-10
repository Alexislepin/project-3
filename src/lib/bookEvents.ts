import { supabase } from './supabase';
import { canonicalBookKey } from './bookSocial';
import { normalizeEventType } from './activityEvents';

/**
 * Create a book event in activity_events when a book is added or status changes
 * @param userId User ID
 * @param bookId Book ID (UUID)
 * @param eventType Type of event: 'book_started', 'book_added', 'book_finished', 'book_liked'
 * @param likeId Optional like ID for book_like events (for upsert onConflict: 'like_id')
 * @returns Promise<void>
 */
export async function createBookEvent(
  userId: string,
  bookId: string,
  eventType: 'book_started' | 'book_added' | 'book_finished' | 'book_liked',
  likeId?: string
): Promise<void> {
  try {
    // ✅ Fetch book data COMPLETE pour créer les snapshots (title, author, cover_url)
    const { data: bookData, error: bookError } = await supabase
      .from('books')
      .select('id, title, author, cover_url, isbn, openlibrary_work_key, openlibrary_edition_key, google_books_id, openlibrary_cover_id')
      .eq('id', bookId)
      .maybeSingle();

    if (bookError || !bookData) {
      console.error('[createBookEvent] Error fetching book:', bookError);
      return;
    }

    // Build book object for canonicalBookKey
    const bookForCanonical = {
      id: bookData.id,
      key: bookData.openlibrary_work_key || undefined,
      isbn: bookData.isbn || undefined,
      isbn13: bookData.isbn || undefined,
      isbn10: bookData.isbn || undefined,
      openLibraryKey: bookData.openlibrary_work_key || undefined,
    };

    const bookKey = canonicalBookKey(bookForCanonical);

    // Normalize event type for activity_events (book_liked -> book_like)
    const normalizedEventType = eventType === 'book_liked' 
      ? normalizeEventType('like') 
      : eventType;

    // ✅ Compute cover URL using canonical helper (pour snapshot cohérent)
    const { resolveBookCover } = await import('./bookCover');
    const snapshotCoverUrl = resolveBookCover({
      customCoverUrl: bookData?.custom_cover_url || null,
      coverUrl: bookData?.cover_url || null,
    });

    // Build payload with snapshots
    const payload: any = {
      actor_id: userId,
      event_type: normalizedEventType,
      book_key: bookKey,
      book_id: bookId, // ✅ FK vers books.id pour permettre les joins (NOT NULL pour book_like)
      book_uuid: bookId, // ✅ Pour la cohérence
      // ✅ SNAPSHOTS: Stocker les métadonnées au moment T (fallback si join books échoue)
      book_title: bookData.title || null,
      book_author: bookData.author || null,
      book_cover_url: snapshotCoverUrl || null,
      created_at: new Date().toISOString(),
    };

    // ✅ Pour book_like: ajouter like_id si fourni et utiliser upsert (idempotent)
    if (normalizedEventType === normalizeEventType('like')) {
      if (likeId) {
        payload.like_id = likeId;
      }
      
      // ✅ Upsert idempotent avec contrainte unique (actor_id, event_type, book_key)
      // Note: on n'utilise plus onConflict: 'like_id' car la contrainte a été supprimée
      const { error: eventError } = await supabase
        .from('activity_events')
        .upsert(payload, {
          onConflict: 'actor_id,event_type,book_key', // ✅ Contrainte unique existante
        });

      if (eventError) {
        // Handle unique constraint violation gracefully (idempotent)
        if (eventError.code === '23505' || eventError.message?.includes('unique') || eventError.message?.includes('duplicate')) {
          console.log('[createBookEvent] Activity event already exists (idempotent)');
        } else {
          console.error('[createBookEvent] Error upserting book_like event:', eventError);
        }
        // Don't throw - this is non-critical
      }
    } else {
      // Autres events: insert normal
      const { error: eventError } = await supabase
        .from('activity_events')
        .insert(payload);

      if (eventError) {
        console.error('[createBookEvent] Error creating event:', eventError);
        // Don't throw - this is non-critical
      }
    }
  } catch (error) {
    console.error('[createBookEvent] Unexpected error:', error);
    // Don't throw - this is non-critical
  }
}

