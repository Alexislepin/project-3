/**
 * Simple Explorer based on OpenLibrary Subjects API
 * Returns books from various subjects in rotation
 */

const OPEN_LIBRARY_SUBJECTS = [
  'fiction',
  'classics',
  'romance',
  'mystery_and_detective_stories',
  'science_fiction',
  'fantasy',
  'thriller',
  'young_adult_fiction',
  'historical_fiction',
  'french_literature',
];

export interface ExplorerBook {
  id: string;
  title: string;
  authors: string;
  cover_i?: number;
}

/**
 * Fetch explorer books from OpenLibrary Subjects API
 * @param page Page number (0-indexed)
 * @param limit Number of books per page (default: 20)
 * @returns Array of books with id, title, authors, cover_i
 */
export async function fetchExplorerBooks(
  page: number,
  limit: number = 20
): Promise<ExplorerBook[]> {
  try {
    // Rotate subjects based on page number
    const subjectIndex = page % OPEN_LIBRARY_SUBJECTS.length;
    const subject = OPEN_LIBRARY_SUBJECTS[subjectIndex];
    
    // Calculate offset for pagination within the subject
    const rotation = Math.floor(page / OPEN_LIBRARY_SUBJECTS.length);
    const offset = rotation * limit;

    const url = `https://openlibrary.org/subjects/${subject}.json?limit=${limit}&offset=${offset}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[OpenLibrary Explorer] Error fetching ${subject}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (!data?.works || !Array.isArray(data.works)) {
      return [];
    }

    // Map works to ExplorerBook format
    const books: ExplorerBook[] = [];
    
    for (const work of data.works) {
      // Extract title
      const title = work.title?.trim();
      if (!title) continue;

      // Extract authors (first author name)
      let authors = 'Auteur inconnu';
      if (Array.isArray(work.authors) && work.authors.length > 0) {
        const firstAuthor = work.authors[0];
        if (firstAuthor?.name) {
          authors = firstAuthor.name.trim();
        }
      }

      // Extract cover_i
      const cover_i = typeof work.cover_id === 'number' ? work.cover_id : 
                     typeof work.cover_i === 'number' ? work.cover_i : 
                     undefined;

      // Generate stable ID from work key
      const id = work.key?.replace('/works/', '') || `ol-${title.toLowerCase().replace(/\s+/g, '-')}`;

      books.push({
        id,
        title,
        authors,
        cover_i,
      });
    }

    return books;
  } catch (error) {
    console.warn('[OpenLibrary Explorer] Error:', error);
    return [];
  }
}

