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

  const description_clean = cleanOpenLibraryDescription(description);

  const source = book?.source || (book?.openlibrary_key || book?.openLibraryKey ? "openlibrary" : book?.google_books_id || book?.googleBooksId ? "google" : null);
  const source_id = book?.source_id || book?.openlibrary_key || book?.openLibraryKey || book?.google_books_id || book?.googleBooksId || book?.volumeInfo?.id || null;

  const openlibrary_key = book?.openlibrary_key || book?.openLibraryKey || (typeof book?.key === "string" && book.key.startsWith("/works/") ? book.key : null);
  const google_books_id = book?.google_books_id || book?.googleBooksId || book?.volumeInfo?.id || null;

  const total_pages = book?.total_pages || book?.pageCount || book?.volumeInfo?.pageCount || null;

  // Fix #2: OpenLibrary cover fallback if cover_url is missing
  let finalCoverUrl = cover_url;
  if (!finalCoverUrl && openlibrary_key) {
    // OpenLibrary cover fallback (avec ?default=false pour éviter redirection archive.org)
    const olid = openlibrary_key.replace('/works/', '').replace('/', '');
    if (olid) {
      finalCoverUrl = `https://covers.openlibrary.org/b/olid/${olid}-L.jpg?default=false`;
    }
  }

  // Extract ISBN (clean)
  const isbn = book?.isbn13 || book?.isbn10 || book?.isbn;
  const cleanIsbn = isbn ? String(isbn).replace(/[-\s]/g, '') : null;

  // Step 1: Check if book already exists by ISBN (idempotent check)
  if (cleanIsbn) {
    const { data: existingByIsbn } = await supabase
      .from("books")
      .select("id, cover_url, description_clean, book_key")
      .eq("isbn", cleanIsbn)
      .maybeSingle();

    if (existingByIsbn) {
      // Book exists by ISBN - update if needed and return id
      const updateData: any = {
        title,
        author,
        total_pages,
        source,
        source_id,
        openlibrary_key,
        google_books_id,
      };

      // IMPORTANT: n'écrase jamais la cover par null
      if (finalCoverUrl) {
        updateData.cover_url = finalCoverUrl;
      }

      // IMPORTANT: n'écrase jamais description par null si on n'a pas de nouvelle description
      if (description) {
        updateData.description = description;
      }

      // IMPORTANT: n'écrase jamais description_clean par null si on n'a pas de nouvelle description_clean
      if (description_clean) {
        updateData.description_clean = description_clean;
      }

      // Update book_key if we have a better one
      if (book_key && book_key !== existingByIsbn.book_key) {
        updateData.book_key = book_key;
      }

      const { error: updateError } = await supabase
        .from("books")
        .update(updateData)
        .eq("id", existingByIsbn.id);

      if (updateError) throw updateError;
      return existingByIsbn.id as string;
    }
  }

  // Step 2: Check if book already exists by book_key (fallback)
  const { data: existingByKey } = await supabase
    .from("books")
    .select("id, cover_url, description_clean")
    .eq("book_key", book_key)
    .maybeSingle();

  if (existingByKey) {
    // Update existing book
    const updateData: any = {
      title,
      author,
      total_pages,
      source,
      source_id,
      openlibrary_key,
      google_books_id,
    };

    if (finalCoverUrl) {
      updateData.cover_url = finalCoverUrl;
    }

    if (description) {
      updateData.description = description;
    }

    if (description_clean) {
      updateData.description_clean = description_clean;
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
          book_key,
          title,
          author,
          total_pages,
          source,
          source_id,
          openlibrary_key,
          google_books_id,
          cover_url: finalCoverUrl,
          description,
          description_clean,
          isbn: cleanIsbn || null,
        },
        {
          onConflict: cleanIsbn ? 'isbn' : 'book_key',
          ignoreDuplicates: false,
        }
      )
      .select("id")
      .single();

    if (error) {
      // If 23505 (duplicate key) or 409, try to fetch existing book
      if ((error as any).code === '23505' || (error as any).code === 'PGRST116' || (error as any).status === 409) {
        // Try to find existing book by ISBN or book_key
        const searchKey = cleanIsbn ? 'isbn' : 'book_key';
        const searchValue = cleanIsbn || book_key;
        
        const { data: existingBook } = await supabase
          .from("books")
          .select("id")
          .eq(searchKey, searchValue)
          .maybeSingle();

        if (existingBook) {
          return existingBook.id as string;
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

