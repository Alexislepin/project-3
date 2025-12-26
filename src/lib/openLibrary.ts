/**
 * DEPRECATED: This function is no longer used.
 * All OpenLibrary metadata fetching should go through the Supabase Edge Function proxy
 * to avoid CORS issues: ${VITE_SUPABASE_URL}/functions/v1/openlibrary?workId=...
 * 
 * For cover IDs, use cover_i from search results or fetchByIsbn in services/openLibrary.ts
 */
export async function fetchOpenLibraryCoverId(_isbn: string): Promise<number | null> {
  // Function deprecated - use services/openLibrary.ts fetchByIsbn instead
  console.warn('[fetchOpenLibraryCoverId] This function is deprecated. Use services/openLibrary.ts fetchByIsbn instead.');
  return null;
}


