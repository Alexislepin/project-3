import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Nettoie une description OpenLibrary (retire HTML, URLs, etc.)
 */
export function cleanOpenLibraryDescription(input?: string | null): string | null {
  if (!input) return null;
  let s = String(input);

  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/https?:\/\/\S+/g, "");
  s = s.replace(/Also (contained in|in).*$/i, "");
  s = s.replace(/[-–—]{4,}/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  if (s.length > 320) s = s.slice(0, 320).replace(/\s+\S*$/, "").trim() + "…";
  return s || null;
}

/**
 * Normalise une chaîne pour la comparaison (lowercase, sans accents, sans espaces multiples)
 */
function normalize(x?: string | null): string {
  return (x || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Nettoie un ISBN (supprime espaces et tirets)
 */
function cleanIsbnString(isbn?: string | number | null): string | null {
  if (!isbn) return null;
  const cleaned = String(isbn).replace(/[-\s]/g, "");
  return cleaned || null;
}

/**
 * Normalise une clé OpenLibrary work au format "/works/OL...W"
 */
function normalizeOpenLibraryWorkKey(key?: string | null): string | null {
  if (!key) return null;
  const s = String(key).trim();
  
  if (s.startsWith("/works/")) {
    return s;
  }
  if (s.startsWith("works/")) {
    return `/${s}`;
  }
  if (s.startsWith("ol:/works/")) {
    return s.replace(/^ol:/, "");
  }
  if (s.match(/^OL\d+W$/)) {
    return `/works/${s}`;
  }
  
  return null;
}

/**
 * Normalise une clé OpenLibrary edition au format "/books/OL...M"
 */
function normalizeOpenLibraryEditionKey(key?: string | null): string | null {
  if (!key) return null;
  const s = String(key).trim();
  
  if (s.startsWith("/books/")) {
    return s;
  }
  if (s.startsWith("books/")) {
    return `/${s}`;
  }
  if (s.startsWith("ol:/books/")) {
    return s.replace(/^ol:/, "");
  }
  if (s.match(/^OL\d+M$/)) {
    return `/books/${s}`;
  }
  
  return null;
}

/**
 * Extrait le titre depuis un objet book (any)
 */
function extractTitle(book: any): string | null {
  const title = book?.title?.trim() || book?.volumeInfo?.title?.trim() || null;
  return title || null;
}

/**
 * Extrait l'auteur depuis un objet book (any)
 * Accepte authors[] / author string / volumeInfo.authors
 */
function extractAuthor(book: any): string | null {
  // Priorité 1: authors array
  if (Array.isArray(book?.authors) && book.authors.length > 0) {
    return book.authors.join(", ").trim() || null;
  }
  
  // Priorité 2: volumeInfo.authors array
  if (Array.isArray(book?.volumeInfo?.authors) && book.volumeInfo.authors.length > 0) {
    return book.volumeInfo.authors.join(", ").trim() || null;
  }
  
  // Priorité 3: author string
  const author = book?.author?.trim() || null;
  if (author) return author;
  
  return null;
}

/**
 * Extrait la cover_url depuis un objet book (any)
 */
function extractCoverUrl(book: any): string | null {
  return (
    book?.cover_url?.trim() ||
    book?.thumbnail?.trim() ||
    book?.coverUrl?.trim() ||
    book?.volumeInfo?.imageLinks?.thumbnail?.trim() ||
    book?.volumeInfo?.imageLinks?.smallThumbnail?.trim() ||
    null
  );
}

/**
 * Extrait la description depuis un objet book (any)
 * Nettoie si OpenLibrary (détecté via openlibrary_work_key ou openlibrary_edition_key)
 */
function extractDescription(book: any, isOpenLibrary: boolean): string | null {
  const raw = book?.description?.trim() || book?.volumeInfo?.description?.trim() || null;
  if (!raw) return null;
  
  if (isOpenLibrary) {
    return cleanOpenLibraryDescription(raw);
  }
  
  return raw;
}

// ============================================================================
// EXTRACTION DES DONNÉES
// ============================================================================

interface ExtractedBookData {
  title: string | null;
  author: string | null;
  cleanIsbn: string | null;
  googleBooksId: string | null;
  openlibraryWorkKey: string | null;
  openlibraryEditionKey: string | null;
  openlibrary_cover_id: number | null;
  total_pages: number | null;
  cover_url: string | null;
  description: string | null;
}

/**
 * Extrait proprement toutes les données d'un objet book (any)
 */
function extractBookData(book: any): ExtractedBookData {
  const title = extractTitle(book);
  const author = extractAuthor(book);
  
  // ISBN (clean)
  const cleanIsbn = cleanIsbnString(
    book?.isbn13 || 
    book?.isbn10 || 
    book?.isbn ||
    book?.volumeInfo?.industryIdentifiers?.find((id: any) => id.type === "ISBN_13")?.identifier ||
    book?.volumeInfo?.industryIdentifiers?.find((id: any) => id.type === "ISBN_10")?.identifier
  );
  
  // Google Books ID
  const googleBooksId = (
    book?.google_books_id?.trim() ||
    book?.googleBooksId?.trim() ||
    book?.id?.trim() ||
    book?.volumeInfo?.id?.trim() ||
    null
  );
  
  // OpenLibrary keys (priorité: work key puis edition key)
  const openlibraryWorkKey = normalizeOpenLibraryWorkKey(
    book?.openlibrary_work_key ||
    book?.openLibraryWorkKey ||
    book?.openLibraryKey ||
    book?.openlibrary_key ||
    null
  );
  
  const openlibraryEditionKey = normalizeOpenLibraryEditionKey(
    book?.openlibrary_edition_key ||
    book?.openLibraryEditionKey ||
    (book?.key && book.key.includes("/books/") ? book.key : null) ||
    null
  );
  
  // OpenLibrary cover ID
  const openlibrary_cover_id = 
    (typeof book?.openlibrary_cover_id === 'number' && book.openlibrary_cover_id > 0) 
      ? book.openlibrary_cover_id
      : (typeof book?.cover_i === 'number' && book.cover_i > 0) 
        ? book.cover_i
        : (typeof book?.coverId === 'number' && book.coverId > 0)
          ? book.coverId
          : null;
  
  // Total pages (uniquement si > 0)
  const total_pages = 
    (typeof book?.total_pages === 'number' && book.total_pages > 0) 
      ? book.total_pages
      : (typeof book?.pageCount === 'number' && book.pageCount > 0) 
        ? book.pageCount
        : (typeof book?.volumeInfo?.pageCount === 'number' && book.volumeInfo.pageCount > 0)
          ? book.volumeInfo.pageCount
          : (typeof book?.pages === 'number' && book.pages > 0)
            ? book.pages
            : (typeof book?.number_of_pages === 'number' && book.number_of_pages > 0)
              ? book.number_of_pages
              : null;
  
  // Cover URL
  const cover_url = extractCoverUrl(book);
  
  // Description (nettoie si OpenLibrary)
  const isOpenLibrary = !!(openlibraryWorkKey || openlibraryEditionKey);
  const description = extractDescription(book, isOpenLibrary);
  
  return {
    title,
    author,
    cleanIsbn,
    googleBooksId,
    openlibraryWorkKey,
    openlibraryEditionKey,
    openlibrary_cover_id,
    total_pages,
    cover_url,
    description,
  };
}

// ============================================================================
// MATCHING DB
// ============================================================================

/**
 * Recherche un livre dans la DB selon l'ordre strict :
 * A) cleanIsbn -> select by isbn
 * B) googleBooksId -> select by google_books_id
 * C) openlibraryWorkKey -> select by openlibrary_work_key
 * D) openlibraryEditionKey -> select by openlibrary_edition_key
 * E) title+author (non vides) -> select by title+author
 */
async function findBookInDB(
  supabase: SupabaseClient,
  data: ExtractedBookData
): Promise<{ 
  id: string; 
  cover_url: string | null; 
  description: string | null; 
  total_pages: number | null;
  isbn: string | null;
  google_books_id: string | null;
  openlibrary_work_key: string | null;
  openlibrary_edition_key: string | null;
} | null> {
  // A) Par ISBN
  if (data.cleanIsbn) {
    const { data: found } = await supabase
      .from("books")
      .select("id, cover_url, description, total_pages, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key")
      .eq("isbn", data.cleanIsbn)
      .maybeSingle();
    
    if (found) return found;
  }
  
  // B) Par Google Books ID
  if (data.googleBooksId) {
    const { data: found } = await supabase
      .from("books")
      .select("id, cover_url, description, total_pages, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key")
      .eq("google_books_id", data.googleBooksId)
      .maybeSingle();
    
    if (found) return found;
  }
  
  // C) Par OpenLibrary work key
  if (data.openlibraryWorkKey) {
    const { data: found } = await supabase
      .from("books")
      .select("id, cover_url, description, total_pages, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key")
      .eq("openlibrary_work_key", data.openlibraryWorkKey)
      .maybeSingle();
    
    if (found) return found;
  }
  
  // D) Par OpenLibrary edition key
  if (data.openlibraryEditionKey) {
    const { data: found } = await supabase
      .from("books")
      .select("id, cover_url, description, total_pages, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key")
      .eq("openlibrary_edition_key", data.openlibraryEditionKey)
      .maybeSingle();
    
    if (found) return found;
  }
  
  // E) Par title+author (si les deux sont non vides)
  if (data.title && data.author) {
    const { data: found } = await supabase
      .from("books")
      .select("id, cover_url, description, total_pages, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key")
      .eq("title", data.title)
      .eq("author", data.author)
      .maybeSingle();
    
    if (found) return found;
  }
  
  return null;
}

// ============================================================================
// UPDATE / INSERT
// ============================================================================

/**
 * Vérifie si on a au moins une clé forte (ISBN, Google, ou OpenLibrary)
 */
function hasStrongKey(data: ExtractedBookData): boolean {
  return !!(data.cleanIsbn || data.googleBooksId || data.openlibraryWorkKey || data.openlibraryEditionKey);
}

/**
 * Valide que les données sont suffisantes pour un insert
 * Refuse si: pas de title (title vide ou null)
 * Pour OpenLibrary: si on a work/edition key mais pas de title, refuser insertion
 */
function canInsert(data: ExtractedBookData): boolean {
  // ⚠️ CRITIQUE: Interdire insertion si title vide/null
  if (!data.title || data.title.trim().length === 0) {
    return false;
  }
  
  // Si on a une clé OpenLibrary mais pas de title, refuser (métadonnées incomplètes)
  if ((data.openlibraryWorkKey || data.openlibraryEditionKey) && !data.title) {
    return false;
  }
  
  // Pour le reste, on accepte si on a title OU (clé forte OU author)
  if (!hasStrongKey(data) && !data.author) return false;
  return true;
}

/**
 * Construit l'objet updateData en n'ajoutant QUE les champs non null/valides
 * Ne jamais overwrite cover_url/description/total_pages par null
 * Met à jour les clés OL/Google/ISBN si on les a et que la DB ne les a pas
 */
function buildUpdateData(
  data: ExtractedBookData,
  existing: { 
    cover_url: string | null; 
    description: string | null; 
    total_pages: number | null;
    isbn: string | null;
    google_books_id: string | null;
    openlibrary_work_key: string | null;
    openlibrary_edition_key: string | null;
  }
): Record<string, any> {
  const updateData: Record<string, any> = {};
  
  // Titre et auteur (toujours mettre à jour si présents)
  if (data.title) updateData.title = data.title;
  if (data.author !== null) updateData.author = data.author; // Permet de set author à null si nécessaire
  
  // Clés fortes: mettre à jour si on les a et que la DB ne les a pas
  if (data.cleanIsbn && !existing.isbn) {
    updateData.isbn = data.cleanIsbn;
  }
  if (data.googleBooksId && !existing.google_books_id) {
    updateData.google_books_id = data.googleBooksId;
  }
  if (data.openlibraryWorkKey && !existing.openlibrary_work_key) {
    updateData.openlibrary_work_key = data.openlibraryWorkKey;
  }
  if (data.openlibraryEditionKey && !existing.openlibrary_edition_key) {
    updateData.openlibrary_edition_key = data.openlibraryEditionKey;
  }
  
  // OpenLibrary cover ID (mettre à jour si présent)
  if (data.openlibrary_cover_id !== null) {
    updateData.openlibrary_cover_id = data.openlibrary_cover_id;
  }
  
  // Cover URL: ne jamais overwrite par null
  if (data.cover_url) {
    updateData.cover_url = data.cover_url;
  }
  
  // Description: ne jamais overwrite par null
  if (data.description) {
    updateData.description = data.description;
  }
  
  // Total pages: ne jamais overwrite par null
  if (data.total_pages !== null) {
    updateData.total_pages = data.total_pages;
  }
  
  return updateData;
}

/**
 * Vérifie si les métadonnées sont manquantes (cover OR pages OR description pauvre)
 * Une description est considérée "pauvre" si elle fait moins de 50 caractères
 */
function needsEnrichment(data: ExtractedBookData, existing: { cover_url: string | null; description: string | null; total_pages: number | null }): boolean {
  const hasCover = !!(data.cover_url || existing.cover_url);
  const hasPages = !!(data.total_pages !== null || existing.total_pages !== null);
  const hasGoodDescription = !!(data.description && data.description.length >= 50) || !!(existing.description && existing.description.length >= 50);
  
  return !hasCover || !hasPages || !hasGoodDescription;
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

const BOOK_TOO_POOR_TO_INSERT = "BOOK_TOO_POOR_TO_INSERT";

/**
 * Assure qu'un livre existe dans la DB
 * 
 * Inputs: supabase client + book(any)
 * 
 * Stratégie:
 * 1) Extraction propre des données
 * 2) Matching DB dans l'ordre strict (ISBN -> Google -> OL work -> OL edition -> title+author)
 * 3) Si trouvé: update avec seulement les champs non-null/valides
 * 4) Si pas trouvé: insert avec validation (refuse si pas de title OU (pas de clé forte ET author vide))
 * 5) Après insert/update, si metadata manque, déclencher book_enrich_v1 en fire-and-forget
 * 
 * Retour: bookId (uuid)
 */
export async function ensureBookInDB(supabase: SupabaseClient, book: any): Promise<string> {
  // 1) Extraction propre des données
  const data = extractBookData(book);
  
  // 2) Matching DB (dans l'ordre strict)
  const existing = await findBookInDB(supabase, data);
  
  if (existing) {
    // 3) Si trouvé: update
    const updateData = buildUpdateData(data, existing);
    
    // Si on a des champs à mettre à jour
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("books")
        .update(updateData)
        .eq("id", existing.id);
      
      if (updateError) throw updateError;
    }
    
    const bookId = existing.id;
    
    // 5) Après update, si metadata manque, déclencher enrichissement (fire-and-forget)
    if (needsEnrichment(data, existing) && hasStrongKey(data)) {
      supabase.functions.invoke('book_enrich_v1', {
        body: {
          bookId,
          isbn: data.cleanIsbn,
          googleBooksId: data.googleBooksId,
          openlibraryWorkKey: data.openlibraryWorkKey,
          openlibraryEditionKey: data.openlibraryEditionKey,
        },
      }).catch((error) => {
        // Fire-and-forget: ne pas faire échouer ensureBookInDB
        console.error('[ensureBookInDB] Error invoking book_enrich_v1:', error);
      });
    }
    
    return bookId;
  }
  
  // 4) Si pas trouvé: insert avec validation
  if (!canInsert(data)) {
    throw new Error(BOOK_TOO_POOR_TO_INSERT);
  }
  
  const insertData: Record<string, any> = {
    title: data.title, // Requis (vérifié par canInsert)
    author: data.author,
    isbn: data.cleanIsbn,
    google_books_id: data.googleBooksId,
    openlibrary_work_key: data.openlibraryWorkKey,
    openlibrary_edition_key: data.openlibraryEditionKey,
    openlibrary_cover_id: data.openlibrary_cover_id,
    total_pages: data.total_pages,
    cover_url: data.cover_url,
    description: data.description,
  };
  
  const { data: inserted, error: insertError } = await supabase
    .from("books")
    .insert(insertData)
    .select("id")
    .single();
  
  if (insertError) throw insertError;
  
  const bookId = inserted.id;
  
  // 5) Après insert, si metadata manque, déclencher enrichissement (fire-and-forget)
  // MAIS seulement si on a au moins une clé forte
  if (needsEnrichment(data, { cover_url: null, description: null, total_pages: null }) && hasStrongKey(data)) {
    supabase.functions.invoke('book_enrich_v1', {
      body: {
        bookId,
        isbn: data.cleanIsbn,
        googleBooksId: data.googleBooksId,
        openlibraryWorkKey: data.openlibraryWorkKey,
        openlibraryEditionKey: data.openlibraryEditionKey,
      },
    }).catch((error) => {
      // Fire-and-forget: ne pas faire échouer ensureBookInDB
      console.error('[ensureBookInDB] Error invoking book_enrich_v1:', error);
    });
  }
  
  return bookId;
}

// ============================================================================
// EXPORT ADDITIONNEL (pour compatibilité)
// ============================================================================

/**
 * @deprecated Utiliser ensureBookInDB directement
 */
export function buildBookKey(book: any): string {
  // Cette fonction est conservée pour compatibilité mais n'est plus utilisée
  // par ensureBookInDB qui utilise maintenant une stratégie canonique
  const data = extractBookData(book);
  
  if (data.cleanIsbn) return `isbn:${data.cleanIsbn}`;
  if (data.googleBooksId) return `gb:${data.googleBooksId}`;
  if (data.openlibraryWorkKey) return `ol:${data.openlibraryWorkKey}`;
  if (data.openlibraryEditionKey) return `ol:${data.openlibraryEditionKey}`;
  if (data.title && data.author) {
    const t = normalize(data.title);
    const a = normalize(data.author);
    return `t:${t}|a:${a}`;
  }
  
  return `unknown:${crypto.randomUUID()}`;
}
