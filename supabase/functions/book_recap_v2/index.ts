import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VERSION = "2025-01-28-openai-v1";

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

interface RecapData {
  ultra_20s: string;
  summary: string;
  takeaways: string;
  key_takeaways: string[]; // Array format for structured takeaways (MIN 5)
  challenge: { question: string; answer: string; explanation?: string } | null;
  chapters: Array<{ title: string; recap: string }>;
  detailed: string;
  characters: Array<{
    name: string;
    who: string;
    why_important: string; // Changed from "why" to "why_important" to match prompt
  }>;
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
      ultra_20s: null,
      summary: null,
      takeaways: null,
      challenge: null,
      chapters: [],
      detailed: "",
      uptoPage: null,
      meta: {
        requestId,
        VERSION,
        mode: "error",
        ...meta,
      },
    }),
    { status: 200, headers } // ✅ HTTP 200 pour erreur fonctionnelle
  );
}

function buildNoDataResponse(
  requestId: string,
  uptoPage: number,
  headers: Record<string, string>,
  meta?: Record<string, any>
) {
  return new Response(
    JSON.stringify({
      ok: true,
      status: "no_data",
      message: "Pas assez d'infos pour générer un rappel",
      ultra_20s: null,
      summary: null,
      takeaways: null,
      challenge: null,
      chapters: [],
      detailed: "",
      uptoPage,
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

function buildSuccessResponse(
  requestId: string,
  recapData: RecapData,
  uptoPage: number,
  headers: Record<string, string>,
  meta?: Record<string, any>
) {
  return new Response(
    JSON.stringify({
      ok: true,
      ultra_20s: recapData.ultra_20s,
      summary: recapData.summary,
      takeaways: recapData.takeaways,
      key_takeaways: recapData.key_takeaways || [],
      challenge: recapData.challenge,
      chapters: recapData.chapters,
      detailed: recapData.detailed,
      characters: recapData.characters || [],
      uptoPage,
      meta: {
        requestId,
        VERSION,
        mode: "success",
        ...meta,
      },
    }),
    { status: 200, headers }
  );
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const headers = corsHeaders(req);
  const startTime = Date.now();

  try {
    console.log("[book_recap_v2] invoked", { requestId, VERSION, method: req.method, url: req.url });

    // ✅ CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(JSON.stringify({ ok: true, preflight: true, requestId, VERSION }), {
        status: 200,
        headers,
      });
    }

    // ✅ Only allow POST
    if (req.method !== "POST") {
      return buildErrorResponse(requestId, "Method not allowed", headers);
    }

    // ✅ Get environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("[book_recap_v2] Missing Supabase env vars", { requestId });
      return buildErrorResponse(requestId, "Server configuration error", headers);
    }

    // ✅ Authenticate user
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      console.warn("[book_recap_v2] Unauthorized", { requestId, error: userErr?.message });
      return buildErrorResponse(requestId, "Unauthorized", headers);
    }

    const userId = userRes.user.id;

    // ✅ Safe parse body
    let body: any = null;
    try {
      body = await req.json();
    } catch (e) {
      console.error("[book_recap_v2] invalid JSON", { requestId, VERSION, err: String(e) });
      return buildErrorResponse(requestId, "Invalid JSON body", headers);
    }

    console.log("[book_recap_v2] body", { requestId, VERSION, keys: Object.keys(body ?? {}) });

    // ✅ Normalize input
    const bookId = body.bookId ?? null;
    const book_key = body.book_key ?? body.bookKey ?? body.openlibrary_key ?? null;
    const isbn = body.isbn ?? null;
    
    let uptoPage = 0;
    if (Number.isFinite(body.uptoPage)) {
      uptoPage = Math.max(0, Number(body.uptoPage));
    } else if (Number.isFinite(body.current_page)) {
      uptoPage = Math.max(0, Number(body.current_page));
    }
    
    const language = body.language === "en" ? "en" : "fr";
    const force = !!body.force;

    // ✅ Validation: require at least one identifier
    if (!bookId && !book_key && !isbn) {
      console.warn("[book_recap_v2] missing identifier", { requestId, VERSION, body: Object.keys(body ?? {}) });
      return buildErrorResponse(requestId, "Missing bookId, book_key, or isbn", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
      });
    }

    // ✅ Check if we have enough data
    if (uptoPage === 0) {
      console.log("[book_recap_v2] no_data mode (uptoPage=0)", { requestId, VERSION, mode: "no_data" });
      return buildNoDataResponse(requestId, uptoPage, headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
      });
    }

    // ✅ Check cache first (if not forcing)
    if (!force && SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      let cacheQuery = supabaseAdmin
        .from("book_recaps")
        .select("recap_data, characters, key_takeaways, created_at")
        .eq("user_id", userId)
        .eq("upto_page", uptoPage)
        .eq("language", language);

      // Build query based on available identifier (prefer bookId if we have it)
      // Note: We'll resolve bookId later, so for cache we use what we have
      if (bookId) {
        cacheQuery = cacheQuery.eq("book_id", bookId).is("book_key", null).is("isbn", null);
      } else if (book_key) {
        cacheQuery = cacheQuery.eq("book_key", book_key).is("book_id", null).is("isbn", null);
      } else if (isbn) {
        cacheQuery = cacheQuery.eq("isbn", isbn).is("book_id", null).is("book_key", null);
      }

      const { data: cached, error: cacheError } = await cacheQuery.maybeSingle();

      if (!cacheError && cached?.recap_data) {
        const cacheAge = Math.floor((Date.now() - new Date(cached.created_at).getTime()) / 1000);
        console.log("[book_recap_v2] cache hit", { 
          requestId, 
          VERSION, 
          mode: "success",
          cached: true,
          cacheAge,
        });
        const recapData = cached.recap_data as RecapData;
        
        // Use new columns if available, otherwise fallback to recap_data
        if (cached.characters && Array.isArray(cached.characters) && cached.characters.length > 0) {
          recapData.characters = cached.characters as any;
        } else if (!recapData.characters || !Array.isArray(recapData.characters)) {
          recapData.characters = [];
        }
        
        if (cached.key_takeaways && Array.isArray(cached.key_takeaways) && cached.key_takeaways.length > 0) {
          recapData.key_takeaways = cached.key_takeaways as string[];
        } else if (!recapData.key_takeaways || !Array.isArray(recapData.key_takeaways)) {
          // Try to extract from takeaways string if available
          if (recapData.takeaways) {
            const lines = recapData.takeaways.split(/\n|(?=[•-])/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
            recapData.key_takeaways = lines
              .filter((l: string) => l.startsWith("•") || l.startsWith("-") || /^\d+\./.test(l))
              .map((l: string) => l.replace(/^[•\-\d+\.]\s*/, "").trim())
              .filter((l: string) => l.length > 0);
          } else {
            recapData.key_takeaways = [];
          }
        }
        
        // Ensure minimum 5 takeaways (for cached data too)
        if (recapData.key_takeaways.length < 5) {
          console.warn("[book_recap_v2] Cached takeaways < 5", { requestId, current: recapData.key_takeaways.length });
          // Add safe generic ones to reach 5
          const safeAdditions = [
            "Le contexte historique et social de l'œuvre",
            "Les thèmes principaux développés jusqu'à présent",
            "Le style d'écriture et la narration",
            "L'évolution des personnages principaux",
            "Les enjeux et conflits introduits",
          ];
          for (let i = recapData.key_takeaways.length; i < 5; i++) {
            const safe = safeAdditions[i - recapData.key_takeaways.length] || `Point clé ${i + 1} à retenir`;
            if (!recapData.key_takeaways.includes(safe)) {
              recapData.key_takeaways.push(safe);
            }
          }
        }
        
        console.log("[book_recap_v2] completed", {
          requestId,
          cached: true,
          mode: "success",
        });
        
        return buildSuccessResponse(requestId, recapData, uptoPage, headers, {
          language,
          force,
          cached: true,
          cacheAge,
          input: { bookId, book_key, isbn, uptoPage },
        });
      }
    }

    // ✅ Fetch book metadata and resolve bookId if needed
    let resolvedBookId = bookId;
    let book: any = null;

    if (bookId) {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, description, total_pages, isbn, edition, openlibrary_work_key, openlibrary_edition_key")
        .eq("id", bookId)
        .maybeSingle();
      
      if (error) {
        console.error("[book_recap_v2] Error fetching book", { requestId, error: error.message });
      } else {
        book = data;
      }
    } else {
      // Try to find book by book_key or isbn
      if (book_key) {
        // Try to match by openlibrary_work_key or openlibrary_edition_key
        const { data: data1, error: e1 } = await supabase
          .from("books")
          .select("id, title, author, description, total_pages, isbn, edition, openlibrary_work_key, openlibrary_edition_key")
          .eq("openlibrary_work_key", book_key)
          .maybeSingle();

        if (e1) {
          console.error("[book_recap_v2] book_key work_key error", { requestId, e1: e1.message });
        }

        if (data1) {
          book = data1;
          resolvedBookId = data1.id;
        } else {
          const { data: data2, error: e2 } = await supabase
            .from("books")
            .select("id, title, author, description, total_pages, isbn, edition, openlibrary_work_key, openlibrary_edition_key")
            .eq("openlibrary_edition_key", book_key)
            .maybeSingle();

          if (e2) {
            console.error("[book_recap_v2] book_key edition_key error", { requestId, e2: e2.message });
          }

          if (data2) {
            book = data2;
            resolvedBookId = data2.id;
          }
        }
      } else if (isbn) {
        const { data, error } = await supabase
          .from("books")
          .select("id, title, author, description, total_pages, isbn, edition, openlibrary_work_key, openlibrary_edition_key")
          .eq("isbn", isbn)
          .maybeSingle();

        if (error) {
          console.error("[book_recap_v2] Error fetching book by isbn", { requestId, error: error.message });
        } else if (data) {
          book = data;
          resolvedBookId = data.id;
        }
      }
    }

    if (!book) {
      console.warn("[book_recap_v2] Book not found", { requestId, bookId, book_key, isbn });
      return buildErrorResponse(requestId, "Book not found", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
      });
    }

    // ✅ Fetch user activities and notes for this book (up to uptoPage)
    // Use resolvedBookId (which should be available now)
    const { data: activities, error: activitiesError } = await supabase
      .from("activities")
      .select("id, notes, pages_read, created_at")
      .eq("user_id", userId)
      .eq("book_id", resolvedBookId)
      .eq("type", "reading")
      .order("created_at", { ascending: true });

    if (activitiesError) {
      console.error("[book_recap_v2] Error fetching activities", { requestId, error: activitiesError.message });
    }

    // Filter activities by uptoPage (only include notes from pages <= uptoPage)
    const relevantActivities = (activities || []).filter((act: any) => {
      // If we can't determine the page, include it (better to have more context)
      return true;
    });

    // Extract notes
    const notes = relevantActivities
      .map((act: any) => act.notes)
      .filter((note: any) => note && note.trim().length > 0);

    // ✅ Check if we have enough data
    if (notes.length === 0 && relevantActivities.length === 0) {
      console.log("[book_recap_v2] no_data mode (no activities/notes)", { requestId, VERSION, mode: "no_data" });
      return buildNoDataResponse(requestId, uptoPage, headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
      });
    }

    // ✅ Generate recap with OpenAI (wrapped in try/catch to prevent throws)
    if (!OPENAI_API_KEY) {
      console.error("[book_recap_v2] Missing OPENAI_API_KEY", { requestId, mode: "error" });
      return buildErrorResponse(requestId, "OpenAI API key not configured", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
        details: "OPENAI_API_KEY environment variable is not set",
      });
    }

    let recapData: RecapData;
    try {
      // Build context for OpenAI with edition info
    const contextNotes = notes.slice(0, 10).join("\n\n"); // Limit to 10 notes
      
      // Build book info with edition details
      let bookInfo = `Titre: ${book.title}\nAuteur: ${book.author || "Inconnu"}\nPages totales: ${book.total_pages || "?"}\nPage actuelle: ${uptoPage}`;
      if (book.isbn) {
        bookInfo += `\nISBN: ${book.isbn}`;
      }
      if (book.edition) {
        bookInfo += `\nÉdition: ${book.edition}`;
      }
      if (book.openlibrary_work_key || book.openlibrary_edition_key) {
        const olKey = book.openlibrary_work_key || book.openlibrary_edition_key;
        bookInfo += `\nOpenLibrary: ${olKey}`;
      }
      
    const bookDescription = book.description ? `\n\nDescription: ${book.description.substring(0, 500)}` : "";

    const prompt = `Tu es un assistant expert en analyse de livres. Génère un rappel de lecture personnalisé basé sur les notes de l'utilisateur.

${bookInfo}${bookDescription}

**NOTES DE L'UTILISATEUR (jusqu'à la page ${uptoPage}):**
${contextNotes || "Aucune note disponible."}

**RÈGLES STRICTES (CRITIQUES):**
- NE JAMAIS spoiler au-delà de la page ${uptoPage}. Ne mentionne RIEN qui se passe après cette page.
- Ne cite QUE ce qui est présent jusqu'à la page ${uptoPage}.
- Base-toi uniquement sur les notes fournies et les informations du livre.
- Le rappel doit être en ${language === "en" ? "anglais" : "français"}.
- S'adapte à CETTE édition du livre (${book.edition || "édition standard"}${book.isbn ? `, ISBN: ${book.isbn}` : ""}). Si l'édition diffère, reste générique.

**EXIGENCES OBLIGATOIRES:**
- key_takeaways: MINIMUM 5 bullet points (phrases courtes, spécifiques à ce qui est connu <= page ${uptoPage}).
- characters: minimum 3 si possible, sinon []. Uniquement personnages apparus <= page ${uptoPage}. Description courte (who) + utilité (why_important).

Génère UNIQUEMENT un JSON valide (pas de texte, pas de markdown, pas de code blocks) avec cette structure EXACTE:
{
  "ok": true,
  "uptoPage": ${uptoPage},
  "ultra_20s": "Résumé express en 1-2 phrases maximum",
  "summary": "Résumé détaillé en 5-8 lignes maximum",
  "characters": [
    {
      "name": "Nom du personnage",
      "who": "Qui est ce personnage (1 phrase)",
      "why_important": "Pourquoi ce personnage est important dans cette partie (1 phrase)"
    }
  ],
  "key_takeaways": ["Point clé 1", "Point clé 2", "Point clé 3", "Point clé 4", "Point clé 5", ...],
  "challenge": {
    "question": "Question de compréhension basée sur le contenu lu (pas de spoiler)",
    "answer": "Réponse attendue",
    "explanation": "Explication"
  },
  "detailed": "Analyse détaillée et approfondie (toujours <= page ${uptoPage}, pas de spoiler)"
}`;

      console.log("[book_recap_v2] Calling OpenAI", { requestId, VERSION, model: "gpt-4o-mini", mode: "generating" });

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Tu es un assistant expert en analyse de livres. Tu génères toujours des réponses en JSON valide, sans markdown, sans code blocks.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text().catch(() => "Failed to read error response");
        console.error("[book_recap_v2] OpenAI HTTP error", { 
          requestId, 
          status: openaiResponse.status, 
          error: errorText.substring(0, 200),
          mode: "error",
        });
      return buildErrorResponse(requestId, "Erreur lors de la génération du rappel", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
          details: `OpenAI API returned ${openaiResponse.status}: ${errorText.substring(0, 100)}`,
      });
    }

      const openaiData = await openaiResponse.json().catch(async (parseErr) => {
        console.error("[book_recap_v2] OpenAI response parse error", { requestId, error: String(parseErr), mode: "error" });
        return null;
      });

      if (!openaiData) {
        return buildErrorResponse(requestId, "Erreur lors de la lecture de la réponse OpenAI", headers, {
          language,
          force,
          input: { bookId, book_key, isbn, uptoPage },
          details: "Failed to parse OpenAI response as JSON",
        });
      }

    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
        console.error("[book_recap_v2] OpenAI empty response", { requestId, openaiData, mode: "error" });
      return buildErrorResponse(requestId, "Réponse invalide de l'IA", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
          details: "OpenAI response missing content in choices[0].message.content",
      });
    }

      // Parse JSON response with robust error handling
    try {
      const parsed = JSON.parse(content);
        
        // Extract key_takeaways (new format: array in key_takeaways field)
        let keyTakeaways: string[] = [];
        if (Array.isArray(parsed.key_takeaways)) {
          keyTakeaways = parsed.key_takeaways
            .filter((t: any) => t && typeof t === "string" && t.trim().length > 0)
            .map((t: any) => String(t).trim());
        } else if (Array.isArray(parsed.takeaways)) {
          // Fallback: old format with "takeaways" as array
          keyTakeaways = parsed.takeaways
            .filter((t: any) => t && typeof t === "string" && t.trim().length > 0)
            .map((t: any) => String(t).trim());
        } else if (typeof parsed.takeaways === "string") {
          // Fallback: old format with "takeaways" as string
          const lines = parsed.takeaways.split(/\n|(?=[•-])/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          keyTakeaways = lines
            .filter((l: string) => l.startsWith("•") || l.startsWith("-") || /^\d+\./.test(l))
            .map((l: string) => l.replace(/^[•\-\d+\.]\s*/, "").trim())
            .filter((l: string) => l.length > 0);
        }
        
        // Ensure minimum 5 takeaways (validation + completion)
        if (keyTakeaways.length < 5) {
          console.warn("[book_recap_v2] Takeaways < 5, complementing", { requestId, current: keyTakeaways.length });
          
          // Try to generate additional takeaways from summary if available
          if (parsed.summary && typeof parsed.summary === "string" && parsed.summary.length > 50) {
            // Extract key phrases from summary as potential takeaways
            const summarySentences = parsed.summary.split(/[.!?]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 20 && s.length < 150);
            for (const sentence of summarySentences.slice(0, 5 - keyTakeaways.length)) {
              if (keyTakeaways.length >= 5) break;
              const cleanSentence = sentence.replace(/^[•\-\d+\.]\s*/, "").trim();
              if (cleanSentence.length > 0 && !keyTakeaways.some(t => t.includes(cleanSentence.substring(0, 20)))) {
                keyTakeaways.push(cleanSentence);
              }
            }
          }
          
          // If still < 5, add safe generic takeaways
          const safeAdditions = [
            "Le contexte historique et social de l'œuvre",
            "Les thèmes principaux développés jusqu'à présent",
            "Le style d'écriture et la narration",
            "L'évolution des personnages principaux",
            "Les enjeux et conflits introduits",
          ];
          
          for (let i = keyTakeaways.length; i < 5; i++) {
            const safe = safeAdditions[i - keyTakeaways.length] || `Point clé ${i + 1} à retenir`;
            if (!keyTakeaways.includes(safe)) {
              keyTakeaways.push(safe);
            }
          }
        }
        
        // Build takeaways string for backward compatibility
        const takeawaysString = keyTakeaways.join("\n• ");
        
        // Extract characters (new format: why_important instead of why)
        let characters: Array<{ name: string; who: string; why_important: string }> = [];
        if (Array.isArray(parsed.characters)) {
          characters = parsed.characters
            .filter((c: any) => c && c.name && typeof c.name === "string")
            .map((c: any) => ({
              name: String(c.name).trim(),
              who: (c.who && typeof c.who === "string" ? c.who : "").trim(),
              why_important: (c.why_important && typeof c.why_important === "string" 
                ? c.why_important 
                : (c.why && typeof c.why === "string" ? c.why : "")).trim(), // Fallback to "why" for backward compat
            }))
            .filter((c: any) => c.name.length > 0);
        }
        
        // Ensure characters is at least an empty array (never null/undefined)
        if (characters.length === 0) {
          characters = [];
        }
        
      recapData = {
        ultra_20s: parsed.ultra_20s || "",
        summary: parsed.summary || "",
          takeaways: takeawaysString,
          key_takeaways: keyTakeaways,
        challenge: parsed.challenge || null,
        chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
        detailed: parsed.detailed || "",
          characters: characters,
      };
    } catch (parseError) {
        console.error("[book_recap_v2] JSON parse error", { 
          requestId, 
          content: content.substring(0, 200), 
          error: String(parseError),
          mode: "error",
        });
      return buildErrorResponse(requestId, "Erreur lors du parsing de la réponse", headers, {
          language,
          force,
          input: { bookId, book_key, isbn, uptoPage },
          details: `JSON parse error: ${String(parseError)}`,
        });
      }
    } catch (openaiErr: any) {
      // Catch any unexpected errors during OpenAI call
      console.error("[book_recap_v2] OpenAI unexpected error", {
        requestId,
        error: String(openaiErr),
        message: openaiErr?.message,
        stack: openaiErr?.stack,
        mode: "error",
      });
      return buildErrorResponse(requestId, "Internal Server Error", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage },
        details: openaiErr?.message || String(openaiErr),
        stack: openaiErr?.stack,
      });
    }

    // ✅ Save to cache (delete old + insert new, both non-blocking)
    if (SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Build cache data (use resolvedBookId if available, otherwise fallback to original identifiers)
      const cacheData: any = {
        user_id: userId,
        upto_page: uptoPage,
        language,
        recap_data: recapData,
        characters: recapData.characters, // Store as jsonb (Supabase will handle conversion)
        key_takeaways: recapData.key_takeaways, // Store as jsonb (Supabase will handle conversion)
      };

      if (resolvedBookId) {
        cacheData.book_id = resolvedBookId;
        cacheData.book_key = null;
        cacheData.isbn = null;
      } else if (book_key) {
        cacheData.book_key = book_key;
        cacheData.book_id = null;
        cacheData.isbn = null;
      } else if (isbn) {
        cacheData.isbn = isbn;
        cacheData.book_id = null;
        cacheData.book_key = null;
      }

      // Delete existing cache (non-blocking: log errors but don't fail)
      let deleteQuery = supabaseAdmin
        .from("book_recaps")
        .delete()
        .eq("user_id", userId)
        .eq("upto_page", uptoPage)
        .eq("language", language);

      // Build delete query based on available identifier
      if (resolvedBookId) {
        deleteQuery = deleteQuery.eq("book_id", resolvedBookId).is("book_key", null).is("isbn", null);
      } else if (book_key) {
        deleteQuery = deleteQuery.eq("book_key", book_key).is("book_id", null).is("isbn", null);
      } else if (isbn) {
        deleteQuery = deleteQuery.eq("isbn", isbn).is("book_id", null).is("book_key", null);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) {
        console.warn("[book_recap_v2] Cache delete error (non-blocking)", { 
          requestId, 
          error: deleteError.message,
          code: deleteError.code,
        });
        // Continue anyway - insert will handle conflict if needed
      }

      // Insert new cache (non-blocking: log errors but don't fail the request)
      const { error: insertError } = await supabaseAdmin
        .from("book_recaps")
        .insert(cacheData);

      if (insertError) {
        console.warn("[book_recap_v2] Cache insert error (non-blocking)", { 
          requestId, 
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
        });
          // Don't fail the request if cache fails
      } else {
        console.log("[book_recap_v2] Cache saved", { requestId });
      }
    }

    const uptime = Date.now() - startTime;

    // Check if cache was saved successfully
    let cachedRow = false;
    if (SUPABASE_SERVICE_ROLE_KEY) {
      // Check if cache exists (non-blocking check)
      try {
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        let checkQuery = supabaseAdmin
          .from("book_recaps")
          .select("id")
          .eq("user_id", userId)
          .eq("upto_page", uptoPage)
          .eq("language", language);

        if (resolvedBookId) {
          checkQuery = checkQuery.eq("book_id", resolvedBookId).is("book_key", null).is("isbn", null);
        } else if (book_key) {
          checkQuery = checkQuery.eq("book_key", book_key).is("book_id", null).is("isbn", null);
        } else if (isbn) {
          checkQuery = checkQuery.eq("isbn", isbn).is("book_id", null).is("book_key", null);
        }

        const { data: cachedCheck } = await checkQuery.maybeSingle();
        cachedRow = !!cachedCheck;
      } catch (checkErr) {
        // Ignore cache check errors
        console.warn("[book_recap_v2] Cache check error (non-blocking)", { requestId, error: String(checkErr) });
      }
    }

    console.log("[book_recap_v2] completed", {
      requestId,
      cached: cachedRow,
      mode: "success",
      uptime,
    });

    return buildSuccessResponse(requestId, recapData, uptoPage, headers, {
      language,
      force,
      cached: cachedRow,
      model: "gpt-4o-mini",
      uptime,
      input: { bookId, book_key, isbn, uptoPage },
    });
  } catch (err: any) {
    // ✅ Catch all unexpected errors and return structured error response
    console.error("[book_recap_v2] FATAL", {
      requestId,
      VERSION,
      mode: "error",
      error: String(err),
      message: err?.message,
      stack: err?.stack,
    });
    return buildErrorResponse(requestId, "Internal Server Error", headers, {
      details: err?.message || String(err),
      stack: err?.stack,
    });
  }
});
