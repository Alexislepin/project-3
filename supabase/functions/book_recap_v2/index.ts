// supabase/functions/book_recap_v2/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RecapResponse {
  summary: string;
  ultra_20s: string;
  takeaways: string;
  question?: string;
  answer?: string;
  explanation?: string;
  key_takeaways?: string[];
  key_moments?: { title: string; detail: string }[];
  challenge?: {
    question: string;
    answer: string;
    explanation: string;
  };
  chapters?: Array<{ title: string; recap: string }>;
  detailed?: string;
}

serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    // ✅ Forward auth header to get user
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);

    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const { bookId, uptoPage = 0, language = "fr", force = false } = body ?? {};

    if (!bookId) return json({ error: "Missing bookId" }, 400);
    if (uptoPage < 0) return json({ error: "Invalid uptoPage" }, 400);

    // Use service role for DB operations that need to bypass RLS (cache lookup and insert)
    const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : supabase;

    // Count notes for meta
    const { count: notesCount, error: notesCountError } = await supabase
      .from("book_notes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .lte("page", uptoPage);

    if (notesCountError) {
      console.error("Error counting notes:", notesCountError);
    }

    // B) Check cache (unless force=true)
    if (!force) {
      const { data: cached, error: cacheError } = await supabaseAdmin
        .from("book_ai_summaries")
        .select("summary, ultra_20s, takeaways, question, upto_page")
        .eq("user_id", userId)
        .eq("book_id", bookId)
        .eq("mode", "v2")
        .eq("language", language)
        .gte("upto_page", uptoPage)
        .order("upto_page", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cacheError && cached?.summary) {
        // Return cached data with legacy format + meta
        return json({
          summary: cached.summary,
          ultra_20s: cached.ultra_20s || "",
          takeaways: cached.takeaways || "",
          question: cached.question || "",
          cached: true,
          uptoPage: cached.upto_page,
          meta: {
            uptoPage: cached.upto_page,
            language,
            notesCount: notesCount || 0,
          },
        });
      }
    }

    // C) Fetch book metadata
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id, title, author, description, total_pages, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key")
      .eq("id", bookId)
      .maybeSingle();

    if (bookError || !book) {
      return json({ error: "Book not found" }, 404);
    }

    // D) Fetch notes up to page
    const { data: notes, error: notesError } = await supabase
      .from("book_notes")
      .select("page, note")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .lte("page", uptoPage)
      .order("page", { ascending: true })
      .limit(40);

    if (notesError) {
      console.error("Error fetching notes:", notesError);
      // Continue without notes if error
    }

    const hasNotes = notes && notes.length > 0;

    // E) Generate recap with OpenAI
    if (!OPENAI_API_KEY) {
      // Return fallback response instead of error
      return json({
        error: "OpenAI API key not configured",
        summary: "",
        ultra_20s: "",
        takeaways: "",
        question: "",
        meta: {
          uptoPage,
          language,
          notesCount: notesCount || 0,
        },
      });
    }

    const totalPages = book.total_pages || 0;
    const pageInfo = uptoPage === 0
      ? "du début du livre"
      : `jusqu'à la page ${uptoPage}${totalPages > 0 ? ` sur ${totalPages}` : ''}`;

    let systemPrompt: string;
    let userPrompt: string;

    if (language === 'fr') {
      systemPrompt = `Tu es un assistant qui génère des rappels de lecture PRÉCIS basés sur les notes de l'utilisateur. 
RÈGLES STRICTES:
1. Si des notes existent, le rappel DOIT être dérivé UNIQUEMENT des notes (vérité primaire). N'invente JAMAIS d'événements qui ne sont pas dans les notes.
2. Si aucune note n'existe, utilise la description du livre + un rappel générique, mais inclut un disclaimer "approximatif".
3. Ne révèle RIEN au-delà de la page ${uptoPage} (zéro spoiler).
4. Réponds UNIQUEMENT en JSON valide, sans texte avant/après.
5. Format JSON strict:
{
  "summary": "recap complet 8-12 lignes (legacy)",
  "ultra_20s": "3-5 lignes max pour 20 secondes",
  "takeaways": "- Point 1\\n- Point 2\\n- Point 3\\n- Point 4\\n- Point 5 (legacy)",
  "key_takeaways": ["Point clé 1", "Point clé 2", "Point clé 3", "Point clé 4", "Point clé 5"],
  "challenge": {
    "question": "1 question profonde pour tester la compréhension (OBLIGATOIRE, même si générique)",
    "answer": "2-3 phrases de réponse courte et claire (OBLIGATOIRE, jamais vide)",
    "explanation": "1-2 phrases expliquant pourquoi cette réponse est importante (optionnel)"
  },
  "chapters": [
    {"title": "Chapitre 1 / Section 1", "recap": "Résumé en 2-3 phrases"},
    {"title": "Chapitre 2 / Section 2", "recap": "Résumé en 2-3 phrases"},
    ...
  ],
  "detailed": "Texte structuré long (fallback si pas de chapters)"
}`;

      if (hasNotes) {
        const notesText = notes!.map((n) => `Page ${n.page}: ${n.note}`).join('\n');
        userPrompt = `Livre: "${book.title}" par ${book.author || 'Auteur inconnu'}
${book.description ? `Description: ${book.description.substring(0, 300)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}

NOTES DE L'UTILISATEUR ${pageInfo}:
${notesText}

Génère un rappel PRÉCIS basé UNIQUEMENT sur ces notes. Ne révèle RIEN au-delà de la page ${uptoPage}.`;
      } else {
        userPrompt = `Livre: "${book.title}" par ${book.author || 'Auteur inconnu'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}

Aucune note disponible. Génère un rappel approximatif ${pageInfo} basé sur les informations disponibles. Inclus un disclaimer que c'est approximatif. Ne révèle RIEN au-delà de la page ${uptoPage}.`;
      }
    } else { // English
      systemPrompt = `You are an assistant that generates PRECISE reading recaps based on user notes.
STRICT RULES:
1. If notes exist, the recap MUST be derived ONLY from the notes (primary truth). NEVER invent events not in the notes.
2. If no notes exist, use book description + generic recap, but include "approximate" disclaimer.
3. Do NOT reveal anything beyond page ${uptoPage} (zero spoilers).
4. Respond ONLY in valid JSON, no text before/after.
5. Strict JSON format:
{
  "summary": "complete recap 8-12 lines (legacy)",
  "ultra_20s": "3-5 lines max for 20 seconds",
  "takeaways": "- Point 1\\n- Point 2\\n- Point 3\\n- Point 4\\n- Point 5 (legacy)",
  "key_takeaways": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"],
  "challenge": {
    "question": "1 deep question to test understanding (REQUIRED, even if generic)",
    "answer": "2-3 sentences short and clear answer (REQUIRED, never empty)",
    "explanation": "1-2 sentences explaining why this answer matters (optional)"
  },
  "chapters": [
    {"title": "Chapter 1 / Section 1", "recap": "Summary in 2-3 sentences"},
    {"title": "Chapter 2 / Section 2", "recap": "Summary in 2-3 sentences"},
    ...
  ],
  "detailed": "Long structured text (fallback if no chapters)"
}`;

      if (hasNotes) {
        const notesText = notes!.map((n) => `Page ${n.page}: ${n.note}`).join('\n');
        userPrompt = `Book: "${book.title}" by ${book.author || 'Unknown author'}
${book.description ? `Description: ${book.description.substring(0, 300)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}

USER NOTES ${uptoPage === 0 ? 'from the beginning' : `up to page ${uptoPage}${totalPages > 0 ? ` of ${totalPages}` : ''}`}:
${notesText}

Generate a PRECISE recap based ONLY on these notes. Do NOT reveal anything beyond page ${uptoPage}.`;
      } else {
        userPrompt = `Book: "${book.title}" by ${book.author || 'Unknown author'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}

No notes available. Generate an approximate recap ${uptoPage === 0 ? 'from the beginning' : `up to page ${uptoPage}${totalPages > 0 ? ` of ${totalPages}` : ''}`} based on available information. Include a disclaimer that it's approximate. Do NOT reveal anything beyond page ${uptoPage}.`;
      }
    }

    // Call OpenAI with JSON mode
    let openaiResponse: Response;
    let openaiData: any;
    let content: string = "";

    try {
      openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1200,
          response_format: { type: "json_object" },
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error("OpenAI API error:", openaiResponse.status, errorText);
        
        // Handle quota/429 errors gracefully
        if (openaiResponse.status === 429 || openaiResponse.status === 503) {
          return json({
            error: "Service temporairement indisponible. Réessayez dans quelques instants.",
            summary: "",
            ultra_20s: "",
            takeaways: "",
            question: "",
            meta: {
              uptoPage,
              language,
              notesCount: notesCount || 0,
            },
          });
        }
        
        return json({
          error: "Impossible de générer le rappel. Veuillez réessayer.",
          summary: "",
          ultra_20s: "",
          takeaways: "",
          question: "",
          meta: {
            uptoPage,
            language,
            notesCount: notesCount || 0,
          },
        });
      }

      openaiData = await openaiResponse.json();
      content = openaiData.choices?.[0]?.message?.content?.trim() || "";
    } catch (fetchError) {
      console.error("OpenAI fetch error:", fetchError);
      return json({
        error: "Erreur de connexion. Vérifiez votre connexion internet.",
        summary: "",
        ultra_20s: "",
        takeaways: "",
        question: "",
        meta: {
          uptoPage,
          language,
          notesCount: notesCount || 0,
        },
      });
    }

    if (!content) {
      return json({
        error: "Réponse vide du service IA",
        summary: "",
        ultra_20s: "",
        takeaways: "",
        question: "",
        meta: {
          uptoPage,
          language,
          notesCount: notesCount || 0,
        },
      });
    }

    // Parse JSON response
    let recapData: RecapResponse;
    try {
      recapData = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse OpenAI JSON response:", parseError, content);
      return json({
        error: "Format de réponse invalide",
        summary: "",
        ultra_20s: "",
        takeaways: "",
        question: "",
        meta: {
          uptoPage,
          language,
          notesCount: notesCount || 0,
        },
      });
    }

    // Validate required fields (minimum)
    if (!recapData.ultra_20s) {
      console.error("Missing required fields in recap:", recapData);
      return json({
        error: "Rappel incomplet généré",
        summary: recapData.summary || "",
        ultra_20s: "",
        takeaways: recapData.takeaways || "",
        meta: {
          uptoPage,
          language,
          notesCount: notesCount || 0,
        },
      });
    }

    // F) Save to cache (legacy fields only for now)
    try {
      await supabaseAdmin
        .from("book_ai_summaries")
        .upsert(
          {
            user_id: userId,
            book_id: bookId,
            upto_page: uptoPage,
            mode: "v2",
            language,
            summary: recapData.summary,
            ultra_20s: recapData.ultra_20s,
            takeaways: recapData.takeaways,
            question: recapData.question,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book_id,mode,language,upto_page" }
        );
    } catch (dbError) {
      console.error("Failed to cache recap:", dbError);
      // Don't fail the request if caching fails
    }

    // Normalize challenge fields - always ensure non-empty values
    const fallbackAnswer = language === 'fr' 
      ? "Pas assez d'infos pour répondre pour l'instant. Ajoute une note après ta session."
      : "Not enough info to answer right now. Add a note after your session.";
    
    const rawQuestion = recapData.challenge?.question || recapData.question || "";
    const rawAnswer = recapData.challenge?.answer || recapData.answer || "";
    const rawExplanation = recapData.challenge?.explanation || recapData.explanation || "";

    // Always provide a question (even if generic)
    const question = rawQuestion.trim() || (language === 'fr' 
      ? "Qu'as-tu retenu de cette partie du livre ?"
      : "What did you remember from this part of the book?");
    
    // Always provide an answer (never empty)
    const answer = rawAnswer.trim() || fallbackAnswer;
    
    // Explanation is optional
    const explanation = rawExplanation.trim() || "";

    // Always return challenge object (never undefined)
    const challenge = {
      question: question,
      answer: answer,
      explanation: explanation,
    };

    // Return structured response with all fields
    return json({
      summary: recapData.summary || "",
      ultra_20s: recapData.ultra_20s,
      takeaways: recapData.takeaways || "",
      // Legacy fields for backward compatibility
      question: question,
      answer: answer,
      explanation: explanation,
      key_takeaways: recapData.key_takeaways || [],
      key_moments: recapData.key_moments || [],
      // New structured fields - challenge is always present
      challenge: challenge,
      chapters: recapData.chapters || undefined,
      detailed: recapData.detailed || recapData.summary || "",
      cached: false,
      uptoPage,
      meta: {
        uptoPage,
        language,
        notesCount: notesCount || 0,
      },
    });
  } catch (e) {
    console.error("Unexpected error in book_recap_v2:", e);
    return json({ error: String(e) }, 500);
  }
});
