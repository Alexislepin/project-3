import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VERSION = "2026-01-11-no-data-kill-switch";

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

// RecapPayload: structure attendue par le front
type RecapPayload = {
  ultra_20s: string;
  summary: string;
  key_takeaways: string[];
  characters: { name: string; role: string }[];
  detailed: string;
  challenge: { question: string; answer: string; explanation: string };
};

// Helper pour parser le JSON du cache (compat rétro)
function safeParseRecap(text: string): RecapPayload | null {
  if (!text || typeof text !== "string") return null;
  try {
    const parsed = JSON.parse(text);
    // Vérifier que tous les champs requis sont présents
    if (
      typeof parsed.ultra_20s === "string" &&
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.key_takeaways) &&
      Array.isArray(parsed.characters) &&
      typeof parsed.detailed === "string" &&
      parsed.challenge &&
      typeof parsed.challenge.question === "string" &&
      typeof parsed.challenge.answer === "string" &&
      typeof parsed.challenge.explanation === "string"
    ) {
      return parsed as RecapPayload;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// Legacy RecapData (pour compat interne)
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
  const recapPayload: RecapPayload = {
    ultra_20s: "Rappel prêt, même sans notes.",
    summary:
      "Je n'ai pas encore de notes/sessions enregistrées pour personnaliser le rappel. En attendant, voici un aperçu général basé sur les informations du livre. Ajoute une note ou termine une session pour un rappel 100% personnalisé.",
    key_takeaways: [
      "Aperçu général du livre (sans spoiler)",
      "Thèmes et enjeux principaux",
      "Contexte et intention de l'auteur",
      "Ce qu'il faut surveiller en lisant",
      "Comment enrichir le rappel (notes/sessions)",
    ],
    characters: [],
    detailed:
      "Astuce : si tu as déjà une progression (ex: page 50), tu peux soit importer une session, soit ajouter une note rapide. L'IA aura alors du contexte concret pour générer un rappel plus fidèle à ce que tu as lu.",
    challenge: {
      question: "Comment obtenir un rappel plus personnalisé ?",
      answer: "Ajouter une note ou enregistrer une session de lecture.",
      explanation: "Ces données donnent du contexte réel à l'IA, sans spoiler.",
    },
  };

  return buildSuccessResponse(requestId, recapPayload, uptoPage, headers, {
    ...meta,
    mode: "fallback_no_user_data",
    noDataBypassed: true,
  });
}

// Convert RecapData to RecapPayload (internal conversion)
function convertRecapDataToPayload(recapData: RecapData): RecapPayload {
  const challenge = recapData.challenge
    ? {
        question: recapData.challenge.question || "",
        answer: recapData.challenge.answer || "",
        explanation: recapData.challenge.explanation || "",
      }
    : {
        question: "",
        answer: "",
        explanation: "",
      };
  return {
    ultra_20s: recapData.ultra_20s || "",
    summary: recapData.summary || "",
    key_takeaways: recapData.key_takeaways || [],
    characters: (recapData.characters || []).map((c: any) => ({
      name: c.name || "",
      role: c.who || c.role || c.why_important || "",
    })),
    detailed: recapData.detailed || "",
    challenge: challenge,
  };
}

function buildSuccessResponse(
  requestId: string,
  recapPayload: RecapPayload,
  uptoPage: number,
  headers: Record<string, string>,
  meta?: Record<string, any>
) {
  return new Response(
    JSON.stringify({
      ok: true,

      // ✅ Legacy/top-level fields (compat avec le front existant)
      ultra_20s: recapPayload.ultra_20s,
      summary: recapPayload.summary,
      key_takeaways: recapPayload.key_takeaways,
      characters: recapPayload.characters,
      detailed: recapPayload.detailed,
      challenge: recapPayload.challenge,

      // ✅ Nouveau format (si tu veux l'utiliser plus tard)
      recap: recapPayload,

      // ✅ meta inchangé
      meta: {
        requestId,
        VERSION,
        uptoPage,
        mode: meta?.mode || "success",
        language: meta?.language || "fr",
        cached: meta?.cached || false,
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
    
    // Store input uptoPage (before DB lookup)
    const inputUptoPage = Number.isFinite(body.uptoPage)
      ? Math.max(0, Number(body.uptoPage))
      : Number.isFinite(body.current_page)
      ? Math.max(0, Number(body.current_page))
      : 0;
    
    const language = body.language === "en" ? "en" : "fr";
    const force = !!body.force;

    // ✅ Validation: require at least one identifier
    if (!bookId && !book_key && !isbn) {
      console.warn("[book_recap_v2] missing identifier", { requestId, VERSION, body: Object.keys(body ?? {}) });
      return buildErrorResponse(requestId, "Missing bookId, book_key, or isbn", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, uptoPage: inputUptoPage },
      });
    }

    // ✅ If uptoPage is 0, generate minimal recap (never return no_data)
    // Note: This should rarely happen, but if it does, we still generate a recap
    // NOTE: Cache check is moved AFTER resolvedBookId and effectiveUptoPage calculation

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
        input: { bookId, book_key, isbn, uptoPage: inputUptoPage },
      });
    }

    // ✅ Calculate effectiveUptoPage = max(inputUptoPage, user_books.current_page)
    // Fetch current_page from user_books to get the actual reading progress
    let dbCurrentPage = 0;
    if (resolvedBookId) {
      const { data: userBook, error: userBookError } = await supabase
        .from("user_books")
        .select("current_page")
        .eq("user_id", userId)
        .eq("book_id", resolvedBookId)
        .maybeSingle();
      
      if (userBookError) {
        console.warn("[book_recap_v2] Error fetching user_books.current_page", { requestId, error: userBookError.message });
      } else if (userBook?.current_page && Number.isFinite(userBook.current_page)) {
        dbCurrentPage = Math.max(0, Number(userBook.current_page));
      }
    }
    
    // Calculate effective uptoPage (use max of input and DB value)
    const effectiveUptoPage = Math.max(inputUptoPage, dbCurrentPage);
    
    console.log("[book_recap_v2] uptoPage calculation", {
      requestId,
      inputUptoPage,
      dbCurrentPage,
      effectiveUptoPage,
      resolvedBookId,
    });

    // ✅ Check cache first (if not forcing) - NOW using effectiveUptoPage and resolvedBookId
    if (!force && SUPABASE_SERVICE_ROLE_KEY && resolvedBookId) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: cached, error: cacheError } = await supabaseAdmin
        .from("book_ai_summaries")
        .select("summary, upto_page, mode, created_at")
        .eq("user_id", userId)
        .eq("book_id", resolvedBookId)
        .eq("upto_page", effectiveUptoPage)
        .eq("language", language)
        .eq("mode", "v2")
        .maybeSingle();

      if (!cacheError && cached?.summary) {
        const cacheAge = Math.floor((Date.now() - new Date(cached.created_at).getTime()) / 1000);
        console.log("[book_recap_v2] cache hit", { 
          requestId, 
          VERSION, 
          mode: "success",
          cached: true,
          cacheAge,
          effectiveUptoPage,
          resolvedBookId,
        });
        
        // Try to parse as JSON (new format)
        const parsed = safeParseRecap(cached.summary);
        if (parsed) {
          // New format: JSON string
          return buildSuccessResponse(requestId, parsed, effectiveUptoPage, headers, {
            language,
            force,
            cached: true,
            cacheAge,
            mode: cached.mode || "v2",
            input: { bookId, book_key, isbn, inputUptoPage, dbCurrentPage, effectiveUptoPage },
          });
        } else {
          // Old format: plain text -> wrap in RecapPayload
          const oldSummary = cached.summary;
          const wrapped: RecapPayload = {
            ultra_20s: oldSummary.slice(0, 180),
            summary: oldSummary,
            key_takeaways: [],
            characters: [],
            detailed: oldSummary,
            challenge: {
              question: "",
              answer: "",
              explanation: "",
            },
          };
          return buildSuccessResponse(requestId, wrapped, effectiveUptoPage, headers, {
            language,
            force,
            cached: true,
            cacheAge,
            mode: cached.mode || "v2",
            input: { bookId, book_key, isbn, inputUptoPage, dbCurrentPage, effectiveUptoPage },
          });
        }
      }
    }

    // ✅ Fetch user activities and notes for this book (up to effectiveUptoPage)
    // Use resolvedBookId (which should be available now)
    // Include both 'reading' and 'progress_import' activities
    const { data: activities, error: activitiesError } = await supabase
      .from("activities")
      .select("id, notes, pages_read, created_at, type")
      .eq("user_id", userId)
      .eq("book_id", resolvedBookId)
      .in("type", ["reading", "progress_import"])
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

    // ✅ Check if we have user data (notes/activities/pages_read)
    // hasUserData = notes exist OR activities exist OR any activity has pages_read > 0 OR progress_import exists
    const hasNotes = notes.length > 0;
    const hasActivities = relevantActivities.length > 0;
    const hasPagesRead = relevantActivities.some((act: any) => act.pages_read && act.pages_read > 0);
    const hasProgressImport = relevantActivities.some((act: any) => act.type === "progress_import");
    const hasUserData = hasNotes || hasActivities || hasPagesRead || hasProgressImport;
    
    let recapData: RecapData;
    
    // ✅ Generate fallback recap if no user data (even if effectiveUptoPage === 0)
    // Never return buildNoDataResponse for this case - always generate a recap
    if (!hasUserData) {
      console.log("[book_recap_v2] fallback mode (no user data, generating universal recap)", { 
        requestId, 
        VERSION, 
        mode: "fallback_no_user_data",
        bookId: resolvedBookId,
        effectiveUptoPage,
        inputUptoPage,
        dbCurrentPage,
        hasNotes,
        hasActivities,
        hasPagesRead,
        hasProgressImport,
      });
      
      // Generate fallback recap using book metadata only
      if (!OPENAI_API_KEY) {
        console.error("[book_recap_v2] Missing OPENAI_API_KEY for fallback", { requestId, mode: "error" });
        return buildErrorResponse(requestId, "OpenAI API key not configured", headers, {
          language,
          force,
          input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
          details: "OPENAI_API_KEY environment variable is not set",
        });
      }

      try {
        // Build book info
        let bookInfo = `Titre: ${book.title}\nAuteur: ${book.author || "Inconnu"}\nPages totales: ${book.total_pages || "?"}`;
        if (effectiveUptoPage > 0) {
          bookInfo += `\nPage actuelle: ${effectiveUptoPage}`;
        } else {
          bookInfo += `\nPage actuelle: 0 (début du livre)`;
        }
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
        
        const bookDescription = book.description ? `\n\nDescription: ${book.description.substring(0, 1000)}` : "";

        // Different prompt based on effectiveUptoPage
        const spoilerRule = effectiveUptoPage === 0
          ? "- STRICTEMENT high-level uniquement: synopsis général, thèmes principaux, contexte historique/social. ZÉRO détail d'intrigue, zéro personnage spécifique, zéro événement narratif."
          : `- NE JAMAIS spoiler au-delà de la page ${effectiveUptoPage}. Reste général et évite les détails spécifiques.`;

        const contextText = effectiveUptoPage === 0
          ? "L'utilisateur vient d'ajouter ce livre à sa bibliothèque mais n'a pas encore commencé la lecture (page 0). Génère un rappel général et informatif basé uniquement sur les métadonnées du livre (titre, auteur, description)."
          : `L'utilisateur a lu jusqu'à la page ${effectiveUptoPage} sur ${book.total_pages || "?"} pages totales, mais n'a pas encore ajouté de notes ou de sessions de lecture. Génère un rappel général et informatif basé sur les informations disponibles du livre.`;

        const fallbackPrompt = `Tu es un assistant expert en analyse de livres. Génère un rappel de lecture universel basé uniquement sur les métadonnées du livre (sans notes utilisateur).

${bookInfo}${bookDescription}

**CONTEXTE:**
${contextText}

**RÈGLES STRICTES:**
${spoilerRule}
- Base-toi uniquement sur les métadonnées fournies (titre, auteur, description).
- Le rappel doit être en ${language === "en" ? "anglais" : "français"}.
- Fais une synthèse haute-niveau, pas de citations longues ou de contenu copié-collé.
- Si tu ne connais pas certains détails, reste général et informatif.

**EXIGENCES OBLIGATOIRES - FORMAT JSON STRICT:**
Génère UNIQUEMENT un JSON valide (pas de texte, pas de markdown, pas de code blocks) avec EXACTEMENT ces clés:
- ultra_20s (string): Résumé express en 1-2 phrases maximum
- summary (string): Résumé détaillé en 5-8 lignes maximum (synthèse haute-niveau)
- key_takeaways (array de strings): MINIMUM 5 bullet points (phrases courtes, basées sur les thèmes généraux)
- characters (array d'objets): Liste courte si possible, sinon []. Chaque objet doit avoir {name: string, role: string}
- detailed (string): Analyse détaillée et approfondie (synthèse haute-niveau, pas de spoiler)
- challenge (objet): {question: string, answer: string, explanation: string} - Question simple de compréhension générale

Exemple de structure JSON:
{
  "ultra_20s": "Résumé express en 1-2 phrases",
  "summary": "Résumé détaillé en 5-8 lignes",
  "key_takeaways": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "characters": [{"name": "Nom", "role": "Rôle/description"}],
  "detailed": "Analyse détaillée",
  "challenge": {"question": "Question", "answer": "Réponse", "explanation": "Explication"}
}`;

        console.log("[book_recap_v2] Calling OpenAI for fallback recap", { requestId, VERSION, model: "gpt-4o-mini", mode: "fallback" });

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
                content: fallbackPrompt,
              },
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text().catch(() => "Failed to read error response");
          console.error("[book_recap_v2] OpenAI HTTP error (fallback)", { 
            requestId, 
            status: openaiResponse.status, 
            error: errorText.substring(0, 200),
            mode: "error",
          });
          return buildErrorResponse(requestId, "Erreur lors de la génération du rappel", headers, {
            language,
            force,
            input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
            details: `OpenAI API returned ${openaiResponse.status}: ${errorText.substring(0, 100)}`,
          });
        }

        const openaiData = await openaiResponse.json().catch(async (parseErr) => {
          console.error("[book_recap_v2] OpenAI response parse error (fallback)", { requestId, error: String(parseErr), mode: "error" });
          return null;
        });

        if (!openaiData) {
          return buildErrorResponse(requestId, "Erreur lors de la lecture de la réponse OpenAI", headers, {
            language,
            force,
            input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
            details: "Failed to parse OpenAI response as JSON",
          });
        }

        const content = openaiData.choices?.[0]?.message?.content;

        if (!content) {
          console.error("[book_recap_v2] OpenAI empty response (fallback)", { requestId, openaiData, mode: "error" });
          return buildErrorResponse(requestId, "Réponse invalide de l'IA", headers, {
            language,
            force,
            input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
            details: "OpenAI response missing content in choices[0].message.content",
          });
        }

        // Parse JSON response and build RecapPayload
        let recapPayload: RecapPayload;
        try {
          const parsed = JSON.parse(content);
          
          // Extract and validate RecapPayload fields
          const keyTakeaways: string[] = Array.isArray(parsed.key_takeaways)
            ? parsed.key_takeaways
                .filter((t: any) => t && typeof t === "string" && t.trim().length > 0)
                .map((t: any) => String(t).trim())
            : [];
          
          // Ensure minimum 5 takeaways
          if (keyTakeaways.length < 5) {
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
          
          // Extract characters (convert role from who/why_important if needed)
          const characters: { name: string; role: string }[] = Array.isArray(parsed.characters)
            ? parsed.characters
                .filter((c: any) => c && c.name && typeof c.name === "string")
                .map((c: any) => ({
                  name: String(c.name).trim(),
                  role: (c.role && typeof c.role === "string")
                    ? c.role.trim()
                    : (c.who && typeof c.who === "string")
                    ? c.who.trim()
                    : (c.why_important && typeof c.why_important === "string")
                    ? c.why_important.trim()
                    : "",
                }))
                .filter((c: any) => c.name.length > 0)
            : [];
          
          // Extract challenge (ensure all fields present)
          const challenge = parsed.challenge && typeof parsed.challenge === "object"
            ? {
                question: String(parsed.challenge.question || "").trim(),
                answer: String(parsed.challenge.answer || "").trim(),
                explanation: String(parsed.challenge.explanation || "").trim(),
              }
            : { question: "", answer: "", explanation: "" };
          
          recapPayload = {
            ultra_20s: String(parsed.ultra_20s || "").trim(),
            summary: String(parsed.summary || "").trim(),
            key_takeaways: keyTakeaways,
            characters: characters,
            detailed: String(parsed.detailed || "").trim(),
            challenge: challenge,
          };
        } catch (parseError) {
          console.error("[book_recap_v2] JSON parse error (fallback)", { 
            requestId, 
            content: content.substring(0, 200), 
            error: String(parseError),
            mode: "error",
          });
          // Fallback: build minimal RecapPayload from raw content
          recapPayload = {
            ultra_20s: content.substring(0, 180),
            summary: content,
            key_takeaways: [],
            characters: [],
            detailed: content,
            challenge: { question: "", answer: "", explanation: "" },
          };
        }
        
        // Save fallback recap to cache (book_ai_summaries.summary as JSON string)
        if (SUPABASE_SERVICE_ROLE_KEY && resolvedBookId) {
          const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          
          const cacheData: any = {
            user_id: userId,
            book_id: resolvedBookId,
            upto_page: effectiveUptoPage,
            language,
            mode: "v2",
            summary: JSON.stringify(recapPayload), // Store as JSON string
          };

          // Upsert (onConflict: user_id, book_id, mode, language, upto_page)
          const { error: upsertError } = await supabaseAdmin
            .from("book_ai_summaries")
            .upsert(cacheData, {
              onConflict: "user_id,book_id,mode,language,upto_page",
            });

          if (upsertError) {
            console.warn("[book_recap_v2] Cache upsert error (fallback, non-blocking)", { 
              requestId, 
              error: upsertError.message,
            });
          } else {
            console.log("[book_recap_v2] Fallback cache saved", { requestId });
          }
        }

        const uptime = Date.now() - startTime;
        console.log("[book_recap_v2] completed (fallback)", {
          requestId,
          mode: "fallback",
          uptime,
          bookId: resolvedBookId,
          effectiveUptoPage,
          inputUptoPage,
          dbCurrentPage,
        });

        return buildSuccessResponse(requestId, recapPayload, effectiveUptoPage, headers, {
          language,
          force,
          cached: false,
          model: "gpt-4o-mini",
          uptime,
          mode: "fallback",
          details: "no_user_data",
          input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
        });
      } catch (fallbackErr: any) {
        console.error("[book_recap_v2] Fallback generation error", {
          requestId,
          error: String(fallbackErr),
          message: fallbackErr?.message,
          mode: "error",
        });
        return buildErrorResponse(requestId, "Erreur lors de la génération du rappel fallback", headers, {
          language,
          force,
          input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
          details: fallbackErr?.message || String(fallbackErr),
        });
      }
    }

    // ✅ Generate recap with OpenAI (wrapped in try/catch to prevent throws)
    // If no user data, fallback should have already handled it
    // This code path is only for personalized recap with user data
    
    if (!OPENAI_API_KEY) {
      console.error("[book_recap_v2] Missing OPENAI_API_KEY", { requestId, mode: "error" });
      return buildErrorResponse(requestId, "OpenAI API key not configured", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
        details: "OPENAI_API_KEY environment variable is not set",
      });
    }

    // Build context for OpenAI with edition info
    const contextNotes = notes.slice(0, 10).join("\n\n"); // Limit to 10 notes
    
    let recapPayload: RecapPayload;
    try {
      // Build book info with edition details
      let bookInfo = `Titre: ${book.title}\nAuteur: ${book.author || "Inconnu"}\nPages totales: ${book.total_pages || "?"}\nPage actuelle: ${effectiveUptoPage}`;
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

**NOTES DE L'UTILISATEUR (jusqu'à la page ${effectiveUptoPage}):**
${contextNotes || "Aucune note disponible."}

**RÈGLES STRICTES (CRITIQUES):**
- NE JAMAIS spoiler au-delà de la page ${effectiveUptoPage}. Ne mentionne RIEN qui se passe après cette page.
- Ne cite QUE ce qui est présent jusqu'à la page ${effectiveUptoPage}.
- Base-toi uniquement sur les notes fournies et les informations du livre.
- Le rappel doit être en ${language === "en" ? "anglais" : "français"}.
- S'adapte à CETTE édition du livre (${book.edition || "édition standard"}${book.isbn ? `, ISBN: ${book.isbn}` : ""}). Si l'édition diffère, reste générique.

**EXIGENCES OBLIGATOIRES - FORMAT JSON STRICT:**
Génère UNIQUEMENT un JSON valide (pas de texte, pas de markdown, pas de code blocks) avec EXACTEMENT ces clés:
- ultra_20s (string): Résumé express en 1-2 phrases maximum
- summary (string): Résumé détaillé en 5-8 lignes maximum
- key_takeaways (array de strings): MINIMUM 5 bullet points (phrases courtes, spécifiques à ce qui est connu <= page ${effectiveUptoPage})
- characters (array d'objets): Minimum 3 si possible, sinon []. Uniquement personnages apparus <= page ${effectiveUptoPage}. Chaque objet doit avoir {name: string, role: string}
- detailed (string): Analyse détaillée et approfondie (toujours <= page ${effectiveUptoPage}, pas de spoiler)
- challenge (objet): {question: string, answer: string, explanation: string} - Question de compréhension basée sur le contenu lu (pas de spoiler)

Exemple de structure JSON:
{
  "ultra_20s": "Résumé express en 1-2 phrases",
  "summary": "Résumé détaillé en 5-8 lignes",
  "key_takeaways": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "characters": [{"name": "Nom", "role": "Rôle/description"}],
  "detailed": "Analyse détaillée",
  "challenge": {"question": "Question", "answer": "Réponse", "explanation": "Explication"}
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
        input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
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
          input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
          details: "Failed to parse OpenAI response as JSON",
        });
      }

    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
        console.error("[book_recap_v2] OpenAI empty response", { requestId, openaiData, mode: "error" });
      return buildErrorResponse(requestId, "Réponse invalide de l'IA", headers, {
        language,
        force,
        input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
          details: "OpenAI response missing content in choices[0].message.content",
      });
    }

      // Parse JSON response and build RecapPayload
      try {
        const parsed = JSON.parse(content);
        
        // Extract and validate RecapPayload fields
        const keyTakeaways: string[] = Array.isArray(parsed.key_takeaways)
          ? parsed.key_takeaways
              .filter((t: any) => t && typeof t === "string" && t.trim().length > 0)
              .map((t: any) => String(t).trim())
          : [];
        
        // Ensure minimum 5 takeaways
        if (keyTakeaways.length < 5) {
          console.warn("[book_recap_v2] Takeaways < 5, complementing", { requestId, current: keyTakeaways.length });
          
          // Try to generate additional takeaways from summary if available
          if (parsed.summary && typeof parsed.summary === "string" && parsed.summary.length > 50) {
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
        
        // Extract characters (convert to {name, role} format)
        const characters: { name: string; role: string }[] = Array.isArray(parsed.characters)
          ? parsed.characters
              .filter((c: any) => c && c.name && typeof c.name === "string")
              .map((c: any) => ({
                name: String(c.name).trim(),
                role: (c.role && typeof c.role === "string")
                  ? c.role.trim()
                  : (c.who && typeof c.who === "string")
                  ? c.who.trim()
                  : (c.why_important && typeof c.why_important === "string")
                  ? c.why_important.trim()
                  : "",
              }))
              .filter((c: any) => c.name.length > 0)
          : [];
        
        // Extract challenge (ensure all fields present)
        const challenge = parsed.challenge && typeof parsed.challenge === "object"
          ? {
              question: String(parsed.challenge.question || "").trim(),
              answer: String(parsed.challenge.answer || "").trim(),
              explanation: String(parsed.challenge.explanation || "").trim(),
            }
          : { question: "", answer: "", explanation: "" };
        
        recapPayload = {
          ultra_20s: String(parsed.ultra_20s || "").trim(),
          summary: String(parsed.summary || "").trim(),
          key_takeaways: keyTakeaways,
          characters: characters,
          detailed: String(parsed.detailed || "").trim(),
          challenge: challenge,
        };
      } catch (parseError) {
        console.error("[book_recap_v2] JSON parse error", { 
          requestId, 
          content: content.substring(0, 200), 
          error: String(parseError),
          mode: "error",
        });
        // Fallback: build minimal RecapPayload from raw content
        recapPayload = {
          ultra_20s: content.substring(0, 180),
          summary: content,
          key_takeaways: [],
          characters: [],
          detailed: content,
          challenge: { question: "", answer: "", explanation: "" },
        };
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
      // Build minimal fallback RecapPayload on error (never return no_data)
      recapPayload = {
        ultra_20s: `Résumé de ${book.title} par ${book.author || "auteur inconnu"}`,
        summary: `Aperçu général de ${book.title}${book.description ? `. ${book.description.substring(0, 300)}` : ""}`,
        key_takeaways: [
          "Le contexte historique et social de l'œuvre",
          "Les thèmes principaux développés jusqu'à présent",
          "Le style d'écriture et la narration",
          "L'évolution des personnages principaux",
          "Les enjeux et conflits introduits",
        ],
        characters: [],
        detailed: book.description ? book.description.substring(0, 500) : `Aperçu général de ${book.title}`,
        challenge: {
          question: `Quel est le thème principal de ${book.title} ?`,
          answer: "Basé sur les informations disponibles du livre",
          explanation: "Question générale sur l'œuvre",
        },
      };
    }

    // ✅ Save to cache (book_ai_summaries.summary as JSON string)
    if (SUPABASE_SERVICE_ROLE_KEY && resolvedBookId) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const cacheData: any = {
        user_id: userId,
        book_id: resolvedBookId,
        upto_page: effectiveUptoPage,
        language,
        mode: "v2",
        summary: JSON.stringify(recapPayload), // Store as JSON string
      };

      // Upsert (onConflict: user_id, book_id, mode, language, upto_page)
      const { error: upsertError } = await supabaseAdmin
        .from("book_ai_summaries")
        .upsert(cacheData, {
          onConflict: "user_id,book_id,mode,language,upto_page",
        });

      if (upsertError) {
        console.warn("[book_recap_v2] Cache upsert error (non-blocking)", { 
          requestId, 
          error: upsertError.message,
          code: upsertError.code,
        });
      } else {
        console.log("[book_recap_v2] Cache saved", { requestId, effectiveUptoPage, resolvedBookId });
      }
    }

    const uptime = Date.now() - startTime;

    console.log("[book_recap_v2] completed", {
      requestId,
      cached: false,
      mode: "success",
      uptime,
      effectiveUptoPage,
      inputUptoPage,
      dbCurrentPage,
    });

    return buildSuccessResponse(requestId, recapPayload, effectiveUptoPage, headers, {
      language,
      force,
      cached: false,
      model: "gpt-4o-mini",
      uptime,
      input: { bookId, book_key, isbn, effectiveUptoPage, inputUptoPage, dbCurrentPage },
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
