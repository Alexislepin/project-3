import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

interface RequestBody {
  bookId: string;
  uptoPage: number;
  mode?: 'global' | 'chapters' | 'bullets';
  language?: 'fr' | 'en';
  force?: boolean; // Force regeneration (bypass cache)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from auth token
    const supabaseClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const {
      bookId,
      uptoPage,
      mode = 'global',
      language = 'fr',
      force = false,
    } = body;

    // Validate required fields
    if (!bookId || uptoPage === undefined || uptoPage < 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: bookId and uptoPage" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for DB operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // A) Check cache (unless force=true)
    if (!force) {
      const { data: cached, error: cacheError } = await supabase
        .from("book_ai_summaries")
        .select("summary, upto_page")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .eq("mode", mode)
        .eq("language", language)
        .gte("upto_page", uptoPage)
        .order("upto_page", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cacheError && cached?.summary) {
        return new Response(
          JSON.stringify({ 
            summary: cached.summary, 
            cached: true, 
            uptoPage: cached.upto_page 
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // B) Fetch book metadata
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id, title, author, description, total_pages, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key")
      .eq("id", bookId)
      .maybeSingle();

    if (bookError || !book) {
      return new Response(
        JSON.stringify({ error: "Book not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // C) Generate recap with OpenAI
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build prompt based on mode
    const totalPages = book.total_pages || 0;
    const pageInfo = uptoPage === 0 
      ? "du début du livre" 
      : `jusqu'à la page ${uptoPage}${totalPages > 0 ? ` sur ${totalPages}` : ''}`;

    let systemPrompt: string;
    let userPrompt: string;

    if (language === 'fr') {
      systemPrompt = "Tu es un assistant qui génère des rappels de lecture. Tu ne dois JAMAIS révéler d'éléments au-delà de la page spécifiée. Si tu n'as pas le texte exact, base-toi sur les informations disponibles (titre, auteur, description, genre) pour créer un rappel cohérent mais approximatif.";
      
      if (mode === 'global') {
        userPrompt = `Livre: "${book.title}" par ${book.author || 'Auteur inconnu'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Génère un rappel de lecture ${pageInfo} en 8-12 lignes. Ne révèle RIEN au-delà de la page ${uptoPage}. Si tu n'as pas le texte exact, indique que c'est un rappel approximatif basé sur les informations disponibles.`;
      } else if (mode === 'chapters') {
        userPrompt = `Livre: "${book.title}" par ${book.author || 'Auteur inconnu'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Génère un rappel ${pageInfo} organisé par sections/actes (ex: "Acte 1", "Partie 1", etc.). Si tu ne connais pas la structure exacte des chapitres, utilise des "Repères" généraux. Ne révèle RIEN au-delà de la page ${uptoPage}.`;
      } else { // bullets
        userPrompt = `Livre: "${book.title}" par ${book.author || 'Auteur inconnu'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Génère un rappel ${pageInfo} sous forme de 10 points clés (bullet points). Ne révèle RIEN au-delà de la page ${uptoPage}.`;
      }
    } else { // English
      systemPrompt = "You are an assistant that generates reading recaps. You must NEVER reveal elements beyond the specified page. If you don't have the exact text, base yourself on available information (title, author, description, genre) to create a coherent but approximate recap.";
      
      if (mode === 'global') {
        userPrompt = `Book: "${book.title}" by ${book.author || 'Unknown author'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Generate a reading recap ${uptoPage === 0 ? 'from the beginning' : `up to page ${uptoPage}${totalPages > 0 ? ` of ${totalPages}` : ''}`} in 8-12 lines. Do NOT reveal anything beyond page ${uptoPage}. If you don't have the exact text, indicate this is an approximate recap based on available information.`;
      } else if (mode === 'chapters') {
        userPrompt = `Book: "${book.title}" by ${book.author || 'Unknown author'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Generate a recap ${uptoPage === 0 ? 'from the beginning' : `up to page ${uptoPage}${totalPages > 0 ? ` of ${totalPages}` : ''}`} organized by sections/acts (e.g., "Act 1", "Part 1", etc.). If you don't know the exact chapter structure, use general "Milestones". Do NOT reveal anything beyond page ${uptoPage}.`;
      } else { // bullets
        userPrompt = `Book: "${book.title}" by ${book.author || 'Unknown author'}
${book.description ? `Description: ${book.description.substring(0, 500)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Generate a recap ${uptoPage === 0 ? 'from the beginning' : `up to page ${uptoPage}${totalPages > 0 ? ` of ${totalPages}` : ''}`} as 10 key points (bullet points). Do NOT reveal anything beyond page ${uptoPage}.`;
      }
    }

    // Add disclaimer
    const disclaimer = language === 'fr' 
      ? "\n\n⚠️ Rappel généré à partir des infos disponibles, peut être approximatif."
      : "\n\n⚠️ Recap generated from available information, may be approximate.";

    userPrompt += disclaimer;

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
        max_tokens: mode === 'bullets' ? 400 : mode === 'chapters' ? 600 : 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate recap" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const summary = openaiData.choices?.[0]?.message?.content?.trim() || "";

    if (!summary) {
      return new Response(
        JSON.stringify({ error: "Empty recap generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // D) Save to cache
    try {
      await supabase
        .from("book_ai_summaries")
        .upsert(
          {
            user_id: user.id,
            book_id: bookId,
            upto_page: uptoPage,
            mode,
            language,
            summary,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,book_id,mode,language,upto_page" }
        );
    } catch (dbError) {
      console.error("Failed to cache recap:", dbError);
      // Don't fail the request if caching fails
    }

    return new Response(
      JSON.stringify({ 
        summary, 
        cached: false, 
        uptoPage 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in book_recap function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

