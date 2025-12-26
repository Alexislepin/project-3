/**
 * Central mapper for activity_events event_type values.
 * 
 * The database CHECK constraint only allows:
 * - 'book_like'
 * - 'book_comment'
 * 
 * This mapper normalizes frontend values to match the constraint.
 */

export type ActivityEventType = 'book_like' | 'book_comment';

/**
 * Maps frontend event type to database-compliant event type.
 * 
 * @param eventType - Frontend event type ('like', 'comment', 'book_like', 'book_comment')
 * @returns Database-compliant event type ('book_like' or 'book_comment')
 * @throws Error if eventType is not supported
 */
export function normalizeEventType(eventType: string): ActivityEventType {
  const normalized = (eventType || '').toLowerCase().trim();
  
  // Map common frontend values to database values
  if (normalized === 'like' || normalized === 'book_like') {
    return 'book_like';
  }
  
  if (normalized === 'comment' || normalized === 'book_comment') {
    return 'book_comment';
  }
  
  throw new Error(`Unsupported activity event type: "${eventType}". Only 'like'/'book_like' and 'comment'/'book_comment' are supported.`);
}

