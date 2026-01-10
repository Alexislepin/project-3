import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Types
interface RequestBody {
  bookId: string;
  isbn?: string | null;
  googleBooksId?: string | null;
  openlibraryWorkKey?: string | null;
  openlibraryEditionKey?: string | null;
}

interface EnrichedMetadata {
  cover_url?: string | null;
  openlibrary_cover_id?: number | null;
  total_pages?: number | null;
  description?: string | null;
  openlibrary_work_key?: string | null;
  openlibrary_edition_key?: string | null;
  google_books_id?: string | null;
}

interface OpenLibraryEdition {
  number_of_pages?: number;
  covers?: number[];
  works?: Array<{ key: string }>;
  work_key?: string;
}

interface OpenLibraryWork {
  covers?: number[];
  description?: string | { value: string };
  number_of_pages_median?: number;
  subjects?: Array<{ work_count?: number; number_of_pages_median?: number }>;
}

interface OpenLibraryISBNResponse {
  key?: string; // Edition key
  works?: Array<{ key: string }>;
  number_of_pages?: number;
  covers?: number[];
  description?: string | { value: string };
  work_key?: string;
}

interface GoogleBook {
  volumeInfo?: {
    description?: string;
    pageCount?: number;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
}

/**
 * Vérifie si une URL de cover est "cassée" ou invalide.
 * Utilisé côté edge pour détecter les covers à remplacer.
 * 
 * @param url - URL de la cover à vérifier
 * @returns true si l'URL est considérée comme cassée/invalide
 */
function isBadCoverUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return true;
  
  const lower = url.toLowerCase();
  
  // Détecter "image not available" (OpenLibrary placeholder)
  if (lower.includes('image not available') || lower.includes('imagenoavailable')) {
    return true;
  }
  
  // Détecter les placeholders génériques
  if (lower.includes('placeholder') || lower.includes('no-cover') || lower.includes('nocover')) {
    return true;
  }
  
  // Détecter les URLs vides ou invalides
  if (url.trim().length === 0) {
    return true;
  }
  
  // Détecter les data URLs invalides (on garde les data:image/svg+xml valides)
  if (url.startsWith('data:') && !url.startsWith('data:image/')) {
    return true;
  }
  
  return false;
}

Deno.serve(async (req) => {
  // 1) CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parse request body
    const body: RequestBody = await req.json();
    const { bookId, isbn, googleBooksId, openlibraryWorkKey, openlibraryEditionKey } = body;

    if (!bookId) {
      return new Response(
        JSON.stringify({ ok: false, error: "bookId is required" }),
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Fetch book from DB
    const { data: book, error: bookError } = await supabaseAdmin
      .from("books")
      .select(
        "id, title, author, isbn, cover_url, description, total_pages, google_books_id, openlibrary_cover_id, openlibrary_work_key, openlibrary_edition_key, updated_at, created_at"
      )
      .eq("id", bookId)
      .maybeSingle();

    if (bookError || !book) {
      return new Response(
        JSON.stringify({ ok: false, error: "Book not found" }),
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    // 5) Guard anti-spam
    const now = new Date();
    const updatedAt = book.updated_at ? new Date(book.updated_at) : new Date(book.created_at);
    const minutesSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60);

    if (minutesSinceUpdate < 30) {
      // Check if book is "assez complet" (cover+pages+desc>120)
      const coverScore = book.cover_url ? 50 : book.openlibrary_cover_id ? 50 : 0;
      const pagesScore = book.total_pages ? 30 : 0;
      const descScore = book.description && book.description.length > 120 ? 40 : 0;
      const totalScore = coverScore + pagesScore + descScore;

      if (totalScore > 120) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: "skip_recent",
            metadata: {
              cover_url: book.cover_url,
              openlibrary_cover_id: book.openlibrary_cover_id,
              total_pages: book.total_pages,
              description: book.description,
              openlibrary_work_key: book.openlibrary_work_key,
              openlibrary_edition_key: book.openlibrary_edition_key,
              google_books_id: book.google_books_id,
            },
          }),
          {
            status: 200,
            headers: corsHeaders,
          }
        );
      }
    }

    // 3) Enrich strategy
    const enriched = await enrichBook({
      isbn: isbn || book.isbn,
      googleBooksId: googleBooksId || book.google_books_id,
      openlibraryWorkKey: openlibraryWorkKey || book.openlibrary_work_key,
      openlibraryEditionKey: openlibraryEditionKey || book.openlibrary_edition_key,
    });

    // 4) DB update - ne jamais écraser un champ existant par null (sauf si cassé)
    const updateData: Partial<EnrichedMetadata> = {};

    // Cover URL: set si absent OU si cassé (isBadCoverUrl)
    if (enriched.cover_url) {
      if (!book.cover_url || isBadCoverUrl(book.cover_url)) {
        updateData.cover_url = enriched.cover_url;
      }
    }
    
    if (enriched.openlibrary_cover_id && !book.openlibrary_cover_id) {
      updateData.openlibrary_cover_id = enriched.openlibrary_cover_id;
    }
    
    // Si on a openlibrary_cover_id mais cover_url absent ou cassé, set automatiquement
    if (enriched.openlibrary_cover_id && (!updateData.cover_url && (!book.cover_url || isBadCoverUrl(book.cover_url)))) {
      updateData.cover_url = `https://covers.openlibrary.org/b/id/${enriched.openlibrary_cover_id}-L.jpg`;
    }
    if (enriched.total_pages && !book.total_pages) {
      updateData.total_pages = enriched.total_pages;
    }
    if (enriched.description && !book.description) {
      updateData.description = enriched.description;
    }
    if (enriched.openlibrary_work_key && !book.openlibrary_work_key) {
      updateData.openlibrary_work_key = enriched.openlibrary_work_key;
    }
    if (enriched.openlibrary_edition_key && !book.openlibrary_edition_key) {
      updateData.openlibrary_edition_key = enriched.openlibrary_edition_key;
    }
    if (enriched.google_books_id && !book.google_books_id) {
      updateData.google_books_id = enriched.google_books_id;
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("books")
        .update(updateData)
        .eq("id", bookId);

      if (updateError) {
        return new Response(
          JSON.stringify({ ok: false, error: `Update failed: ${updateError.message}` }),
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        metadata: {
          cover_url: updateData.cover_url ?? book.cover_url ?? null,
          openlibrary_cover_id: updateData.openlibrary_cover_id ?? book.openlibrary_cover_id ?? null,
          total_pages: updateData.total_pages ?? book.total_pages ?? null,
          description: updateData.description ?? book.description ?? null,
          openlibrary_work_key: updateData.openlibrary_work_key ?? book.openlibrary_work_key ?? null,
          openlibrary_edition_key: updateData.openlibrary_edition_key ?? book.openlibrary_edition_key ?? null,
          google_books_id: updateData.google_books_id ?? book.google_books_id ?? null,
        },
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});

// Helper functions
async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": "Lexu/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return await r.json();
}

function normalizeOlKey(key: string | null | undefined): string | null {
  if (!key) return null;
  // Normalize: "ol:/works/OL123W" -> "/works/OL123W" or keep "/works/OL123W"
  return key.replace(/^ol:/, "");
}

function cleanOpenLibraryDescription(input?: string | { value: string } | null): string | null {
  if (!input) return null;
  let s = typeof input === "string" ? input : input.value || "";
  if (!s) return null;

  // Remove HTML tags
  s = s.replace(/<[^>]*>/g, " ");
  // Remove URLs
  s = s.replace(/https?:\/\/\S+/g, "");
  // Remove "Also contained in" noise
  s = s.replace(/Also (contained in|in).*$/i, "");
  // Remove repeated dashes
  s = s.replace(/[-–—]{4,}/g, " ");
  // Clean whitespace
  s = s.replace(/\s+/g, " ").trim();

  // Limit to ~320 characters
  if (s.length > 320) {
    s = s.slice(0, 320).replace(/\s+\S*$/, "").trim() + "…";
  }

  return s || null;
}

async function enrichBook(input: {
  isbn?: string | null;
  googleBooksId?: string | null;
  openlibraryWorkKey?: string | null;
  openlibraryEditionKey?: string | null;
}): Promise<EnrichedMetadata> {
  const enriched: EnrichedMetadata = {};

  try {
    // Priorité 1: ISBN
    if (input.isbn) {
      const cleanIsbn = String(input.isbn).replace(/[-\s]/g, "");
      
      try {
        // Try OpenLibrary /isbn/{isbn}.json
        const isbnResponse = await fetchJson<OpenLibraryISBNResponse>(
          `https://openlibrary.org/isbn/${cleanIsbn}.json`
        );

        // Get edition key from response (it's the ISBN endpoint, so we have the edition)
        if (isbnResponse.key) {
          const editionKey = normalizeOlKey(isbnResponse.key);
          if (editionKey) {
            enriched.openlibrary_edition_key = editionKey;
          }
        }

        // Get work key from edition
        let workKey: string | null = null;
        if (isbnResponse.work_key) {
          workKey = normalizeOlKey(isbnResponse.work_key);
        } else if (isbnResponse.works && isbnResponse.works.length > 0) {
          workKey = normalizeOlKey(isbnResponse.works[0].key);
        }

        // Pages from edition (priorité)
        if (isbnResponse.number_of_pages && isbnResponse.number_of_pages > 0) {
          enriched.total_pages = isbnResponse.number_of_pages;
        }

        if (Array.isArray(isbnResponse.covers) && isbnResponse.covers.length > 0) {
          enriched.openlibrary_cover_id = isbnResponse.covers[0];
          enriched.cover_url = `https://covers.openlibrary.org/b/id/${isbnResponse.covers[0]}-L.jpg`;
        }

        // Description from edition
        if (isbnResponse.description) {
          const cleaned = cleanOpenLibraryDescription(isbnResponse.description);
          if (cleaned && cleaned.length >= 120) {
            enriched.description = cleaned;
          }
        }

        // If we have work key, fetch work for additional data
        if (workKey) {
          try {
            const work = await fetchJson<OpenLibraryWork>(`https://openlibrary.org${workKey}.json`);

            // Cover from work (if not already set)
            if (!enriched.openlibrary_cover_id && Array.isArray(work.covers) && work.covers.length > 0) {
              enriched.openlibrary_cover_id = work.covers[0];
              enriched.cover_url = `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg`;
            }

            // Description from work (if not already set or work description is better)
            if (!enriched.description || enriched.description.length < 120) {
              const workDesc = cleanOpenLibraryDescription(work.description);
              if (workDesc && workDesc.length >= 120) {
                enriched.description = workDesc;
              }
            }

            // Pages from work median (fallback si pas déjà set)
            if (!enriched.total_pages) {
              if (work.number_of_pages_median && work.number_of_pages_median > 0) {
                enriched.total_pages = work.number_of_pages_median;
              }
            }

            enriched.openlibrary_work_key = workKey;
          } catch (e) {
            // Work fetch failed, continue with edition data
            enriched.openlibrary_work_key = workKey;
          }
        }
      } catch (e) {
        // ISBN endpoint failed, continue to other strategies
      }
    }

    // Priorité 2: OpenLibrary workKey (si pas déjà enrichi via ISBN)
    if (!enriched.openlibrary_work_key && input.openlibraryWorkKey) {
      const workKey = normalizeOlKey(input.openlibraryWorkKey);
      if (workKey) {
        try {
          const work = await fetchJson<OpenLibraryWork>(`https://openlibrary.org${workKey}.json`);

          // Cover
          if (!enriched.openlibrary_cover_id && Array.isArray(work.covers) && work.covers.length > 0) {
            enriched.openlibrary_cover_id = work.covers[0];
            enriched.cover_url = `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg`;
          }

          // Description
          if (!enriched.description) {
            const workDesc = cleanOpenLibraryDescription(work.description);
            if (workDesc && workDesc.length >= 120) {
              enriched.description = workDesc;
            }
          }

          // Pages from work median (fallback)
          if (!enriched.total_pages) {
            if (work.number_of_pages_median && work.number_of_pages_median > 0) {
              enriched.total_pages = work.number_of_pages_median;
            }
          }

          enriched.openlibrary_work_key = workKey;
        } catch (e) {
          // Work fetch failed
        }
      }
    }

    // Priorité 3: OpenLibrary editionKey (pour pages et meilleure cover)
    if (input.openlibraryEditionKey) {
      const editionKey = normalizeOlKey(input.openlibraryEditionKey);
      if (editionKey) {
        try {
          const edition = await fetchJson<OpenLibraryEdition>(`https://openlibrary.org${editionKey}.json`);

          // Pages (priorité edition)
          if (edition.number_of_pages && edition.number_of_pages > 0) {
            enriched.total_pages = edition.number_of_pages;
          }

          // Cover (priorité edition)
          if (Array.isArray(edition.covers) && edition.covers.length > 0) {
            enriched.openlibrary_cover_id = edition.covers[0];
            enriched.cover_url = `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg`;
          }

          enriched.openlibrary_edition_key = editionKey;
        } catch (e) {
          // Edition fetch failed
        }
      }
    }

    // Priorité 4: Google Books (si clé env disponible)
    if (!enriched.description || !enriched.total_pages || !enriched.cover_url) {
      const googleId = input.googleBooksId?.replace(/^google:/, "") || input.googleBooksId;
      if (googleId) {
        const googleApiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");
        if (googleApiKey) {
          try {
            const googleBook = await fetchJson<GoogleBook>(
              `https://www.googleapis.com/books/v1/volumes/${googleId}?key=${googleApiKey}`
            );

            if (googleBook.volumeInfo) {
              // Description (si pas déjà trouvée)
              if (!enriched.description && googleBook.volumeInfo.description) {
                const cleaned = googleBook.volumeInfo.description.trim();
                if (cleaned.length >= 120) {
                  enriched.description = cleaned;
                }
              }

              // Pages (si pas déjà trouvées)
              if (!enriched.total_pages && googleBook.volumeInfo.pageCount && googleBook.volumeInfo.pageCount > 0) {
                enriched.total_pages = googleBook.volumeInfo.pageCount;
              }

              // Cover (si pas déjà trouvée)
              if (!enriched.cover_url && googleBook.volumeInfo.imageLinks) {
                const coverUrl =
                  googleBook.volumeInfo.imageLinks.thumbnail || googleBook.volumeInfo.imageLinks.smallThumbnail;
                if (coverUrl) {
                  enriched.cover_url = coverUrl.replace(/zoom=\d+/, "zoom=0").replace(/&edge=curl/, "");
                }
              }

              enriched.google_books_id = googleId;
            }
          } catch (e) {
            // Google Books fetch failed
          }
        }
      }
    }

    // Log minimal si enrich renvoie 0 champs
    if (Object.keys(enriched).length === 0) {
      const reasons: string[] = [];
      if (!input.isbn && !input.googleBooksId && !input.openlibraryWorkKey && !input.openlibraryEditionKey) {
        reasons.push('no identifiers');
      } else if (input.isbn || input.openlibraryWorkKey || input.openlibraryEditionKey) {
        reasons.push('fetch failed');
      }
      console.log(`[book_enrich_v1] Enrich returned 0 fields: ${reasons.join(', ')}`);
    }
    
    return enriched;
  } catch (e) {
    console.error("Enrichment error:", e);
    return enriched;
  }
}
