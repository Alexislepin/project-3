import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VERSION = "2025-02-28-v1";

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "capacitor://localhost",
  "ionic://localhost",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}

function buildErrorResponse(
  requestId: string,
  error: string,
  headers: Record<string, string>,
  meta?: Record<string, any>
) {
  return new Response(
    JSON.stringify({
      ok: false,
      error,
      blurb: null,
      cached: false,
      meta: {
        requestId,
        VERSION,
        mode: "error",
        ...meta,
      },
    }),
    { status: 200, headers } // HTTP 200 pour erreur fonctionnelle
  );
}

function buildSuccessResponse(
  requestId: string,
  blurb: string,
  source: string,
  headers: Record<string, string>,
  cached: boolean = false,
  meta?: Record<string, any>
) {
  return new Response(
    JSON.stringify({
      ok: true,
      blurb,
      source,
      cached,
      meta: {
        requestId,
        VERSION,
        mode: cached ? "cached" : "success",
        ...meta,
      },
    }),
    { status: 200, headers }
  );
}

function buildNoDataResponse(
  requestId: string,
  headers: Record<string, string>,
  meta?: Record<string, any>
) {
  return new Response(
    JSON.stringify({
      ok: true,
      status: "no_data",
      blurb: null,
      cached: false,
      meta: {
        requestId,
        VERSION,
        mode: "no_data",
        ...meta,
      },
    }),
    { status: 200, headers }
  );
}

/**
 * Normalise book_key selon les conventions du projet
 * Compatible avec canonicalBookKey() du frontend
 */
function normalizeBookKey(input: {
  book_key?: string | null;
  isbn?: string | null;
  bookId?: string | null;
}): string | null {
  // Si book_key fourni, normaliser selon les conventions
  if (input.book_key && typeof input.book_key === "string" && input.book_key.trim()) {
    const key = input.book_key.trim();
    
    // Déjà au format canonique ol:/works/OL...W
    if (key.startsWith("ol:/works/OL") && key.endsWith("W")) {
      return key;
    }
    
    // Normaliser OpenLibrary key si nécessaire
    if (key.startsWith("/works/OL") && key.endsWith("W")) {
      return `ol:${key}`;
    }
    if (key.startsWith("works/OL") && key.endsWith("W")) {
      return `ol:/${key}`;
    }
    // Extraire OL...W si présent
    const olMatch = key.match(/OL\d+W/);
    if (olMatch) {
      return `ol:/works/${olMatch[0]}`;
    }
    
    // Si c'est déjà un format valide (isbn:..., id:..., etc.), le garder
    if (key.startsWith("isbn:") || key.startsWith("id:") || key.startsWith("uuid:") || key.startsWith("google:")) {
      return key;
    }
    
    return key;
  }

  // Sinon si isbn => book_key = `isbn:${isbn}`
  if (input.isbn) {
    const cleanIsbn = String(input.isbn).replace(/[-\s]/g, "");
    if (cleanIsbn.length >= 10) {
      return `isbn:${cleanIsbn}`;
    }
  }

  // Sinon si bookId => book_key = `id:${bookId}`
  if (input.bookId) {
    return `id:${input.bookId}`;
  }

  return null;
}

/**
 * Récupère une description depuis OpenLibrary
 */
async function fetchOpenLibraryDescription(bookKey: string): Promise<string | null> {
  try {
    // Si book_key ressemble à `ol:/works/OL...W` ou `/works/OL...W`
    const olMatch = bookKey.match(/OL\d+W/);
    if (olMatch) {
      const workId = olMatch[0];
      const url = `https://openlibrary.org/works/${workId}.json`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[book_blurb_v1] OpenLibrary work fetch failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      
      // Champs: description (string ou {value})
      let description: string | null = null;
      if (typeof data.description === "string") {
        description = data.description;
      } else if (data.description?.value) {
        description = data.description.value;
      }

      return description;
    }

    // Sinon si isbn
    if (bookKey.startsWith("isbn:")) {
      const isbn = bookKey.replace("isbn:", "");
      const url = `https://openlibrary.org/isbn/${isbn}.json`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[book_blurb_v1] OpenLibrary ISBN fetch failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      
      // Chercher works[] puis fetch work.json
      if (data.works && Array.isArray(data.works) && data.works.length > 0) {
        const workKey = data.works[0].key; // ex: "/works/OL123W"
        if (workKey) {
          const workId = workKey.replace("/works/", "").replace(".json", "");
          const workUrl = `https://openlibrary.org/works/${workId}.json`;
          
          const workResponse = await fetch(workUrl);
          if (workResponse.ok) {
            const workData = await workResponse.json();
            if (typeof workData.description === "string") {
              return workData.description;
            } else if (workData.description?.value) {
              return workData.description.value;
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("[book_blurb_v1] Error fetching OpenLibrary description:", error);
    return null;
  }
}

/**
 * Nettoie le texte source (strip HTML, trim, max ~1200 chars)
 */
function cleanSourceText(text: string): string {
  // Strip HTML tags
  let cleaned = text.replace(/<[^>]*>/g, "");
  // Trim
  cleaned = cleaned.trim();
  // Max ~1200 chars
  if (cleaned.length > 1200) {
    cleaned = cleaned.substring(0, 1200) + "...";
  }
  return cleaned;
}

/**
 * Traduit le texte en français si nécessaire
 */
async function translateToFrench(
  text: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string> {
  try {
    // Appel interne à l'edge function translate
    const translateUrl = `${supabaseUrl}/functions/v1/translate`;
    const response = await fetch(translateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
        "apikey": serviceRoleKey,
      },
      body: JSON.stringify({
        text: text,
        targetLang: "fr",
        target: "fr",
      }),
    });

    if (!response.ok) {
      console.warn("[book_blurb_v1] Translation failed, using original text");
      return text;
    }

    const data = await response.json();
    if (data.translatedText) {
      return data.translatedText;
    }

    return text;
  } catch (error) {
    console.error("[book_blurb_v1] Translation error:", error);
    return text;
  }
}

/**
 * Condense le texte en blurb 2-3 lignes avec OpenAI
 */
async function condenseToBlurb(
  text: string,
  title: string | null,
  author: string | null,
  openaiKey: string | null
): Promise<string> {
  // Si pas d'OpenAI, fallback = 2-3 phrases tronquées
  if (!openaiKey) {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const firstThree = sentences.slice(0, 3).join(". ").trim();
    return firstThree.length > 0 ? firstThree + "." : text.substring(0, 200) + "...";
  }

  try {
    const prompt = `Crée un résumé court (2 à 3 phrases maximum) du livre suivant. 
Règles strictes:
- 2 à 3 phrases maximum
- Pas de spoiler
- Ton neutre et clair
- Pas de guillemets
- Pas de formules comme "Ce livre raconte..." ou "L'auteur décrit..."

${title ? `Titre: ${title}` : ""}
${author ? `Auteur: ${author}` : ""}

Description source:
${text.substring(0, 1000)}

Résumé court:`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Tu es un assistant qui crée des résumés courts de livres. Réponds uniquement avec le résumé, sans commentaire.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.warn("[book_blurb_v1] OpenAI API error, using fallback");
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      const firstThree = sentences.slice(0, 3).join(". ").trim();
      return firstThree.length > 0 ? firstThree + "." : text.substring(0, 200) + "...";
    }

    const data = await response.json();
    const blurb = data.choices?.[0]?.message?.content?.trim();
    
    if (blurb && blurb.length > 0) {
      return blurb;
    }

    // Fallback
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const firstThree = sentences.slice(0, 3).join(". ").trim();
    return firstThree.length > 0 ? firstThree + "." : text.substring(0, 200) + "...";
  } catch (error) {
    console.error("[book_blurb_v1] OpenAI error:", error);
    // Fallback
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const firstThree = sentences.slice(0, 3).join(". ").trim();
    return firstThree.length > 0 ? firstThree + "." : text.substring(0, 200) + "...";
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const headers = corsHeaders(req);
  const startTime = Date.now();

  try {
    console.log("[book_blurb_v1] invoked", { requestId, VERSION, method: req.method });

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(JSON.stringify({ ok: true, preflight: true, requestId, VERSION }), {
        status: 200,
        headers,
      });
    }

    // Only allow POST
    if (req.method !== "POST") {
      return buildErrorResponse(requestId, "Method not allowed", headers);
    }

    // Get environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[book_blurb_v1] Missing Supabase env vars", { requestId });
      return buildErrorResponse(requestId, "Server configuration error", headers);
    }

    // Parse body
    let body: any = null;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[book_blurb_v1] invalid JSON", { requestId, err: String(e) });
      return buildErrorResponse(requestId, "Invalid JSON body", headers);
    }

    // Normalize input
    const bookId = body.bookId ?? null;
    const book_key_raw = body.book_key ?? body.bookKey ?? null;
    const isbn = body.isbn ?? null;
    const title = body.title ?? null;
    const author = body.author ?? null;
    const language = (body.language === "en" ? "en" : "fr") as "fr" | "en";
    const force = !!body.force;

    // Normaliser book_key
    const book_key = normalizeBookKey({ book_key: book_key_raw, isbn, bookId });
    if (!book_key) {
      return buildErrorResponse(requestId, "Missing identifier", headers, {
        input: { bookId, book_key: book_key_raw, isbn },
      });
    }

    // Create service role client for DB operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check cache first (if not forcing)
    if (!force) {
      const { data: cached, error: cacheError } = await supabaseAdmin
        .from("book_blurbs")
        .select("blurb, status, source, updated_at")
        .eq("book_key", book_key)
        .eq("language", language)
        .eq("status", "ready")
        .maybeSingle();

      if (!cacheError && cached?.blurb) {
        console.log("[book_blurb_v1] cache hit", { requestId, VERSION });
        return buildSuccessResponse(
          requestId,
          cached.blurb,
          cached.source,
          headers,
          true,
          {
            language,
            book_key,
            cacheAge: Math.floor((Date.now() - new Date(cached.updated_at).getTime()) / 1000),
          }
        );
      }
    }

    // Fetch description from OpenLibrary
    const sourceText = await fetchOpenLibraryDescription(book_key);
    if (!sourceText || sourceText.trim().length === 0) {
      console.log("[book_blurb_v1] no_data mode (no description found)", { requestId, VERSION });
      
      // Upsert status='no_data'
      await supabaseAdmin
        .from("book_blurbs")
        .upsert({
          book_key,
          isbn: isbn || null,
          title: title || null,
          author: author || null,
          language,
          source: "openlibrary",
          source_text: null,
          blurb: "",
          status: "no_data",
          error: null,
        }, {
          onConflict: "book_key,language",
          ignoreDuplicates: false,
        });

      return buildNoDataResponse(requestId, headers, {
        language,
        book_key,
      });
    }

    // Clean source text
    const cleanedText = cleanSourceText(sourceText);

    // Translate to French if needed
    let translatedText = cleanedText;
    if (language === "fr") {
      // Simple check: if text contains mostly French characters, assume it's already French
      // Otherwise translate
      const frenchCharRatio = (cleanedText.match(/[àâäéèêëïîôùûüÿç]/gi) || []).length / Math.max(cleanedText.length, 1);
      if (frenchCharRatio < 0.05) {
        // Probably not French, translate
        translatedText = await translateToFrench(cleanedText, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      }
    }

    // Condense to blurb
    const blurb = await condenseToBlurb(translatedText, title, author, OPENAI_API_KEY || null);

    // Upsert in DB
    const source = OPENAI_API_KEY ? "mixed" : "openlibrary";
    const { error: upsertError } = await supabaseAdmin
      .from("book_blurbs")
      .upsert({
        book_key,
        isbn: isbn || null,
        title: title || null,
        author: author || null,
        language,
        source,
        source_text: cleanedText,
        blurb,
        status: "ready",
        error: null,
      }, {
        onConflict: "book_key,language",
      });

    if (upsertError) {
      console.error("[book_blurb_v1] Upsert error:", upsertError);
      // Continue anyway, return the blurb
    }

    console.log("[book_blurb_v1] success", {
      requestId,
      VERSION,
      mode: "success",
      duration: Date.now() - startTime,
    });

    return buildSuccessResponse(requestId, blurb, source, headers, false, {
      language,
      book_key,
      duration: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("[book_blurb_v1] Exception:", error);
    return buildErrorResponse(
      requestId,
      "Internal error",
      headers,
      {
        details: error?.message || String(error),
      }
    );
  }
});

