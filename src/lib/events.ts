/**
 * Simple event emitter for cross-component communication
 * Used to notify when social actions (like/comment) happen
 */

class SocialEventEmitter extends EventTarget {
  /**
   * Dispatch a social change event
   * @param bookKey - The book_key that changed
   */
  emitSocialChanged(bookKey: string) {
    this.dispatchEvent(new CustomEvent('socialChanged', { detail: { bookKey } }));
  }
}

// Singleton instance
export const socialEvents = new SocialEventEmitter();

