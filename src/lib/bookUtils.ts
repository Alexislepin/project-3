/**
 * Helper function to clean OpenLibrary descriptions
 * Removes noise like "Also contained in", repeated dashes, URLs, and limits to ~300 chars
 */
export function cleanOpenLibraryDescription(description: string | null | undefined): string | null {
  if (!description || typeof description !== 'string') {
    return null;
  }

  let cleaned = description.trim();

  // Remove "Also contained in" and similar noise
  cleaned = cleaned.replace(/Also contained in[^.]*\./gi, '');
  cleaned = cleaned.replace(/Also in[^.]*\./gi, '');
  cleaned = cleaned.replace(/See also[^.]*\./gi, '');

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');

  // Remove repeated dashes (---, --, etc.)
  cleaned = cleaned.replace(/-{2,}/g, '-');

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Limit to ~300 characters (cut at word boundary)
  if (cleaned.length > 300) {
    cleaned = cleaned.substring(0, 300);
    const lastSpace = cleaned.lastIndexOf(' ');
    if (lastSpace > 200) {
      cleaned = cleaned.substring(0, lastSpace);
    }
    cleaned = cleaned.trim() + '...';
  }

  return cleaned || null;
}

