import type { SupabaseClient } from "@supabase/supabase-js";

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

function normalize(x?: string | null): string {
  return (x || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildBookKey(book: any): string {
  // 1) id/key direct
  if (book?.book_key) return String(book.book_key);
  if (book?.id) return String(book.id);
  if (book?.key) return String(book.key);

  // 2) source ids
  if (book?.openlibrary_key) return `ol:${book.openlibrary_key}`;
  if (book?.openLibraryKey) return `ol:${book.openLibraryKey}`;
  if (book?.google_books_id) return `gb:${book.google_books_id}`;
  if (book?.googleBooksId) return `gb:${book.googleBooksId}`;
  if (book?.source && book?.source_id) return `${book.source}:${book.source_id}`;

  // 3) isbn
  const isbn = book?.isbn13 || book?.isbn10 || book?.isbn;
  if (isbn) return `isbn:${isbn}`;

  // 4) fallback title+author
  const t = normalize(book?.title);
  const a = normalize(book?.author || (Array.isArray(book?.authors) ? book.authors?.[0] : book?.authors));
  if (t || a) return `t:${t}|a:${a}`;

  return `unknown:${crypto.randomUUID()}`;
}

export async function ensureBookInDB(supabase: SupabaseClient, book: any): Promise<string> {
  const book_key = buildBookKey(book);

  const title = book?.title?.trim?.() || book?.volumeInfo?.title?.trim?.() || "Untitled";
  const author =
    (Array.isArray(book?.authors) ? book.authors.join(", ") : book?.authors) ||
    book?.author ||
    (Array.isArray(book?.volumeInfo?.authors) ? book.volumeInfo.authors.join(", ") : null);

  const cover_url =
    book?.cover_url ||
    book?.thumbnail ||
    book?.coverUrl ||
    book?.volumeInfo?.imageLinks?.thumbnail ||
    null;

  const description =
    book?.description ||
    book?.volumeInfo?.description ||
    null;

  const google_books_id = book?.google_books_id || book?.googleBooksId || book?.volumeInfo?.id || null;

  // Extract OpenLibrary keys for description fetching
  let openlibrary_work_key: string | null = null;
  let openlibrary_edition_key: string | null = null;
  
  // Extract from various formats
  if (book?.openLibraryKey || book?.openlibrary_key || book?.openLibraryWorkKey) {
    const key = book?.openLibraryKey || book?.openlibrary_key || book?.openLibraryWorkKey;
    if (typeof key === 'string') {
      // Normalize: /works/OL123456W or works/OL123456W -> /works/OL123456W
      if (key.includes('/works/')) {
        openlibrary_work_key = key.startsWith('/') ? key : `/${key}`;
      } else if (key.includes('/books/')) {
        openlibrary_edition_key = key.startsWith('/') ? key : `/${key}`;
      } else if (key.startsWith('OL') && key.endsWith('W')) {
        openlibrary_work_key = `/works/${key}`;
      } else if (key.startsWith('OL') && key.endsWith('M')) {
        openlibrary_edition_key = `/books/${key}`;
      }
    }
  }
  
  // Also check if we have work key from fetchByIsbn result
  if (book?.openLibraryWorkKey) {
    const workKey = book.openLibraryWorkKey;
    if (typeof workKey === 'string' && workKey.includes('/works/')) {
      openlibrary_work_key = workKey.startsWith('/') ? workKey : `/${workKey}`;
    }
  }

  // Extract total_pages: prefer existing, then pageCount, then volumeInfo.pageCount
  // IMPORTANT: Only set if > 0, otherwise null (not 0)
  const total_pages = 
    (typeof book?.total_pages === 'number' && book.total_pages > 0) ? book.total_pages :
    (typeof book?.pageCount === 'number' && book.pageCount > 0) ? book.pageCount :
    (typeof book?.volumeInfo?.pageCount === 'number' && book.volumeInfo.pageCount > 0) ? book.volumeInfo.pageCount :
    (typeof book?.pages === 'number' && book.pages > 0) ? book.pages :
    (typeof book?.number_of_pages === 'number' && book.number_of_pages > 0) ? book.number_of_pages :
    null;

  // Use cover_url as-is (no OpenLibrary fallback since we don't have openlibrary_key in DB)
  let finalCoverUrl = cover_url;

  // Extract ISBN (clean)
  const isbn = book?.isbn13 || book?.isbn10 || book?.isbn;
  const cleanIsbn = isbn ? String(isbn).replace(/[-\s]/g, '') : null;

  // Step 1: Check if book already exists by ISBN (idempotent check)
  if (cleanIsbn) {
    const { data: existingByIsbn } = await supabase
      .from("books")
      .select("id, cover_url, description")
      .eq("isbn", cleanIsbn)
      .maybeSingle();

    if (existingByIsbn) {
      // Book exists by ISBN - update if needed and return id
      const updateData: any = {
        title,
        author,
        total_pages,
        google_books_id,
      };

      // Update OpenLibrary keys if available (don't overwrite existing with null)
      if (openlibrary_work_key) {
        updateData.openlibrary_work_key = openlibrary_work_key;
      }
      if (openlibrary_edition_key) {
        updateData.openlibrary_edition_key = openlibrary_edition_key;
      }

      // IMPORTANT: n'écrase jamais la cover par null
      if (finalCoverUrl) {
        updateData.cover_url = finalCoverUrl;
      }

      // IMPORTANT: n'écrase jamais description par null si on n'a pas de nouvelle description
      if (description) {
        updateData.description = description;
      }

      const { error: updateError } = await supabase
        .from("books")
        .update(updateData)
        .eq("id", existingByIsbn.id);

      if (updateError) throw updateError;
      return existingByIsbn.id as string;
    }
  }

  // Step 2: Check if book already exists by title+author (fallback)
  // Note: We can't use book_key since it doesn't exist in books table
  // Instead, we'll try to match by title and author if available
  const { data: existingByKey } = await supabase
    .from("books")
    .select("id, cover_url, description")
    .eq("title", title)
    .eq("author", author || "")
    .maybeSingle();

  if (existingByKey) {
    // Update existing book
    const updateData: any = {
      title,
      author,
      total_pages,
      google_books_id,
    };

    // Update OpenLibrary keys if available (don't overwrite existing with null)
    if (openlibrary_work_key) {
      updateData.openlibrary_work_key = openlibrary_work_key;
    }
    if (openlibrary_edition_key) {
      updateData.openlibrary_edition_key = openlibrary_edition_key;
    }

    if (finalCoverUrl) {
      updateData.cover_url = finalCoverUrl;
    }

    if (description) {
      updateData.description = description;
    }

    if (cleanIsbn) {
      updateData.isbn = cleanIsbn;
    }

    const { error: updateError } = await supabase
      .from("books")
      .update(updateData)
      .eq("id", existingByKey.id);

    if (updateError) throw updateError;
    return existingByKey.id as string;
  }

  // Step 3: Insert new book (idempotent with upsert on isbn)
  try {
    const { data: upserted, error } = await supabase
      .from("books")
      .upsert(
        {
          title,
          author,
          total_pages,
          google_books_id,
          cover_url: finalCoverUrl,
          description,
          isbn: cleanIsbn || null,
          openlibrary_work_key: openlibrary_work_key || null,
          openlibrary_edition_key: openlibrary_edition_key || null,
        },
        {
          onConflict: cleanIsbn ? 'isbn' : undefined,
          ignoreDuplicates: false,
        }
      )
      .select("id")
      .single();

    if (error) {
      // If 23505 (duplicate key) or 409, try to fetch existing book
      if ((error as any).code === '23505' || (error as any).code === 'PGRST116' || (error as any).status === 409) {
        // Try to find existing book by ISBN
        if (cleanIsbn) {
          const { data: existingBook } = await supabase
            .from("books")
            .select("id")
            .eq("isbn", cleanIsbn)
            .maybeSingle();

          if (existingBook) {
            return existingBook.id as string;
          }
        }
      }
      throw error;
    }

    return upserted.id as string;
  } catch (err: any) {
    // Fallback: if upsert fails with 23505, try to fetch by ISBN
    if (err?.code === '23505' && cleanIsbn) {
      const { data: existingBook } = await supabase
        .from("books")
        .select("id")
        .eq("isbn", cleanIsbn)
        .maybeSingle();

      if (existingBook) {
        return existingBook.id as string;
      }
    }
    throw err;
  }
}

